# Rails Job Patterns

Use the standard Rails and adapter syntax already established in the repo. This reference focuses on non-obvious ActiveJob structure, idempotency, retries, batching, and backend selection.

## `_later` Entry Points and Shallow Jobs

Define the async entry point near the domain operation, and keep the job as a wrapper.

```ruby
class Webhook::Delivery < ApplicationRecord
  after_create_commit :deliver_later

  def deliver_later
    Webhook::DeliveryJob.perform_later(id)
  end

  def deliver
    return if completed?

    response = perform_request
    update!(status: :completed, response: response)
  rescue Net::OpenTimeout, Net::ReadTimeout
    raise
  rescue StandardError => error
    update!(status: :failed, error_message: error.message)
    raise
  end
end

class Webhook::DeliveryJob < ApplicationJob
  queue_as :webhooks
  retry_on Net::OpenTimeout, Net::ReadTimeout, wait: :exponentially_longer, attempts: 10
  discard_on ActiveJob::DeserializationError

  def perform(delivery_id)
    Webhook::Delivery.find(delivery_id).deliver
  end
end
```

In service-oriented or API-first apps, the job can wrap a command object instead:

```ruby
class SyncInvoiceJob < ApplicationJob
  queue_as :integrations

  def perform(invoice_id)
    SyncInvoice.new(invoice_id).call
  end
end
```

The same rule applies in every profile: queueing, retry, and argument reloads live in the job; business behavior lives elsewhere.

## Retry and Discard Strategy

Map failures to one of three outcomes:

| Failure kind | Policy | Notes |
| --- | --- | --- |
| Timeouts, rate limits, brief upstream outages | `retry_on` | Use repo-standard wait or backoff and finite attempts |
| Missing deleted record, stale serialized argument, invalid permanent state | `discard_on` or early return | Retries will not make the job valid |
| Unknown bug or invariant violation | let it raise | Surface to error reporting and operator attention |

```ruby
class SyncInvoiceJob < ApplicationJob
  queue_as :integrations
  retry_on Net::OpenTimeout, Net::ReadTimeout, wait: :exponentially_longer, attempts: 8
  retry_on Upstream::RateLimited, wait: 1.minute, attempts: 20
  discard_on ActiveJob::DeserializationError

  def perform(invoice_id)
    invoice = Invoice.find_by(id: invoice_id)
    return unless invoice

    InvoiceSync.new(invoice).call
  end
end
```

### Pick One Retry Owner

- **ActiveJob-first repos** keep application retry policy in `retry_on` and `discard_on`.
- **Sidekiq-heavy repos** may centralize retries in Sidekiq options or middleware.
- Do not stack both without intent. Competing retry schedules make failures harder to reason about.

## Idempotency: Double-Check Locking

Guard clauses alone leave a race window. Re-check the state under lock:

```ruby
class ImportDataJob < ApplicationJob
  def perform(import_id)
    import = Import.find(import_id)
    return if import.completed?

    import.with_lock do
      return if import.completed?
      process_import(import)
      import.update!(status: :completed, completed_at: Time.current)
    end
  end
end
```

Use DB uniqueness constraints or state transitions where they fit, but keep idempotency inside the job path as well. Uniqueness at enqueue time does not replace safe execution.

## Concurrency Control

### Solid Queue — `limits_concurrency`

```ruby
class Storage::MaterializeJob < ApplicationJob
  queue_as :backend
  limits_concurrency to: 1, key: ->(owner_id) { owner_id }
  discard_on ActiveJob::DeserializationError

  def perform(owner_id)
    Owner.find(owner_id).materialize_storage
  end
end
```

Use this when one tenant, account, or record should not have multiple workers mutating it in parallel.

### Sidekiq — Uniqueness Middleware

```ruby
class SyncUserJob < ApplicationJob
  sidekiq_options lock: :until_executed,
                  lock_args_method: ->(args) { [args.first] }

  def perform(user_id)
    UserSync.new(user_id).call
  end
end
```

Common lock styles:
- `:until_executing` — unique while queued
- `:until_executed` — unique through completion
- `:until_and_while_executing` — most restrictive

Uniqueness reduces duplicate enqueues. It does not remove the need for idempotent job bodies.

## Self-Splitting Batch Jobs

For datasets too large for one execution, process one slice and enqueue the next:

```ruby
class LargeDataProcessJob < ApplicationJob
  BATCH_SIZE = 1_000

  def perform(dataset_id, offset = 0)
    dataset = Dataset.find(dataset_id)
    batch = dataset.records.offset(offset).limit(BATCH_SIZE)
    return if batch.empty?

    process_batch(batch)
    self.class.perform_later(dataset_id, offset + BATCH_SIZE)
  end
end
```

Use this instead of a single long-running job that holds DB connections, exhausts memory, or risks hitting worker timeouts.

## Efficient Bulk Enqueueing (Rails 7.1+)

Use `ActiveJob.perform_all_later` when you already have many job instances ready to enqueue:

```ruby
class Notification::Bundle
  class << self
    def deliver_all_later
      due.find_in_batches do |batch|
        jobs = batch.map { |bundle| DeliverBundleJob.new(bundle.id) }
        ActiveJob.perform_all_later(jobs)
      end
    end
  end
end
```

This keeps enqueue work in one DB operation instead of many single inserts.

## Scheduled and Recurring Jobs

Respect the scheduler the repo already uses.

### Solid Queue recurring jobs

```yaml
# config/recurring.yml
production:
  deliver_bundled_notifications:
    command: "Notification::Bundle.deliver_all_later"
    schedule: every 30 minutes

  delete_unused_tags:
    class: DeleteUnusedTagsJob
    schedule: every day at 04:02
```

### Recurring job idempotency

```ruby
class DailyReportJob < ApplicationJob
  def perform(date = Date.current)
    return if Report.exists?(date: date, kind: "daily")

    report = Report.create!(date: date, kind: "daily", data: generate_report(date))
    ReportMailer.daily(report).deliver_later
  end
end
```

Recurring jobs must tolerate duplicate scheduling, slow retries, and overlapping deploy windows.

## Multi-Tenant Context Serialization

For multi-tenant apps built around `CurrentAttributes`, capture tenant context at enqueue time and restore it on execution:

```ruby
module TenantScopedActiveJob
  extend ActiveSupport::Concern

  prepended do
    attr_reader :account
    self.enqueue_after_transaction_commit = true
  end

  def initialize(...)
    super
    @account = Current.account
  end

  def serialize
    super.merge("account" => @account&.to_gid)
  end

  def deserialize(job_data)
    super
    @account = GlobalID::Locator.locate(job_data["account"]) if job_data["account"]
  end

  def perform_now
    return super unless account

    Current.with_account(account) { super }
  end
end

ActiveSupport.on_load(:active_job) do
  prepend TenantScopedActiveJob
end
```

Skip this for single-tenant apps. Detect it first by checking for `Current.account`, tenant foreign keys, or an existing job extension.

## Backend and Context Detection

| Check | Why it matters |
| --- | --- |
| `config.active_job.queue_adapter` | Tells you whether the app is on Solid Queue, Sidekiq, or another adapter |
| `config/queue.yml`, `config/recurring.yml` | Shows Solid Queue queues and recurring jobs |
| `config/sidekiq.yml`, scheduler gems, Sidekiq initializers | Shows Sidekiq queues, concurrency, and scheduling |
| `Current.account` or `Current.tenant` usage | Signals tenant-context serialization needs |
| Rails version in `Gemfile.lock` | Determines whether `perform_all_later` is available |

```bash
rg "config\\.active_job\\.queue_adapter|queue_adapter" config
rg "sidekiq|solid_queue|good_job|que" Gemfile config
rg "Current\\.(account|tenant)" app config
rg "^    rails " Gemfile.lock
```

## Job Anti-Patterns

| Anti-pattern | Prefer |
| --- | --- |
| Business logic inside the job | Delegate to model or service and keep the job as an adapter |
| Guard clause without a lock or other execution-time protection | Double-check locking or another idempotent state transition |
| Huge `find_in_batches` loop inside one job | Self-splitting batches or `perform_all_later` |
| Backend-specific retries layered on top of unrelated ActiveJob retries | One explicit retry owner |
| Queueing everything on `default` | Queue segmentation that matches workload priority and worker topology |

# Rails Testing Patterns

Use the standard RSpec or Minitest syntax already established in the repo. This reference focuses on Rails-specific decision points. For behavior-first assertions, mocking discipline, and other language-agnostic testing rules, load `/skill:engineering-principles`.

## Framework and Test Data Defaults

Match the repo even when this matrix is different from your preference.

| Decision | Omakase | Service-Oriented | API-First |
| --- | --- | --- | --- |
| Framework | Minitest | RSpec | RSpec |
| Test data | Fixtures | FactoryBot | FactoryBot |
| Directory | `test/` | `spec/` | `spec/` |
| First tests to write | Integration and model tests | Model/unit tests plus request specs | Request specs |
| System tests | Yes, for key flows | Sparingly | No — prefer request specs |

## Test Type Decision Guide

| Test type | When to write it | Speed | ROI notes |
| --- | --- | --- | --- |
| Model / unit | Business logic, validations, scopes, custom methods | Fast | Highest ROI when the behavior stays inside models or extracted Ruby objects |
| Request | API endpoints, auth flows, parameter handling, response contracts | Medium | Highest ROI for RSpec service-oriented and API-first apps |
| Integration | Multi-step workflows spanning controllers in Minitest-style suites | Medium | Rails-default full-stack coverage for omakase apps |
| System | Critical user journeys and JavaScript-dependent flows | Slow | Keep a small set; never use these as the default CRUD safety net |
| Mailer | Non-trivial content, conditional delivery, multipart output | Fast | Skip trivial scaffold coverage |
| Job | Idempotency, retry behavior, queue selection, external side effects | Fast | Always test jobs that touch external services |

## Fixtures vs FactoryBot: Real Trade-offs

### When Fixtures Win

- **Speed at scale**: Large suites pay for hundreds of factory inserts; fixtures load once.
- **Referential integrity**: Fixture relationships fail fast when foreign keys drift.
- **Stable domains**: Named records such as `admin:` or `member:` can be clearer than deep factory chains.

### When FactoryBot Wins

- **Rapidly changing schemas**: Update one factory default instead of many YAML records.
- **Combinatorial states**: Traits compose more cleanly than proliferating named fixtures.
- **Test-local data**: Each example sets up exactly the records it needs.

### Hybrid Approach

Use fixtures for stable reference data and FactoryBot for transactional records that vary per test.

```ruby
# test/fixtures/roles.yml or spec/fixtures/roles.yml
admin:
  name: admin
  permissions: manage_all

member:
  name: member
  permissions: read_only

FactoryBot.define do
  factory :order do
    user
    status { :pending }

    trait :completed do
      status { :completed }
      completed_at { 1.hour.ago }
    end
  end
end
```

## Performance Patterns That Matter in Rails Suites

### Prefer `build` Over `create` Unless Persistence Matters

```ruby
# SLOW: writes to the database before validating
it "requires an email" do
  user = create(:user, email: nil)
  expect(user).not_to be_valid
end

# FAST: keeps the test in memory
it "requires an email" do
  user = build(:user, email: nil)
  expect(user).not_to be_valid
end
```

Use `create` only when the test needs persisted state for queries, associations, or full request/integration behavior.

### Prefer Transactions Before DatabaseCleaner

- Rails transactional tests are sufficient for most suites.
- Add DatabaseCleaner only for tests that cannot rely on transactions, such as browser-driven system tests or code paths that commit in a separate thread.
- Do not make truncation the default cleanup strategy; it is much slower than transactions.

### Parallel Test Pitfalls

Watch for:
1. Shared database state or global caches.
2. File-system, ENV, or cache mutations that leak across workers.
3. Browser or port collisions in system tests.

```ruby
class ActiveSupport::TestCase
  parallelize(workers: :number_of_processors)

  parallelize_setup do |worker|
    ActiveStorage::Blob.service.root = "#{ActiveStorage::Blob.service.root}-#{worker}"
  end
end
```

## Rails-Specific Anti-Patterns

| Anti-pattern | Prefer | Why |
| --- | --- | --- |
| Testing Rails internals such as built-in validations or routing mechanics | Test your domain rules and app-specific behavior | Rails already has its own coverage |
| Controller-spec style testing for request behavior | Request specs or integration tests | Covers middleware, routing, params, and responses as the app actually runs |
| `sleep` in system tests | Capybara waiting matchers such as `have_content` or `assert_text` | `sleep` adds flakiness and wasted time |
| Huge factory graphs with many eager associations | Minimal defaults plus traits, or fixtures for static data | Easier failures and faster setup |
| System tests for ordinary CRUD forms | Request or integration tests | Similar confidence at a fraction of the cost |

## Boundary Doubles in Rails

Keep doubles at external boundaries. For the underlying philosophy, load `/skill:engineering-principles`.

```ruby
# Bad: stubbing ActiveRecord makes the test stop exercising real app behavior
allow(User).to receive(:find).and_return(user)

# Good: stub an external payment boundary
allow(Stripe::PaymentIntent).to receive(:create).and_return(
  double(id: "pi_123", status: "succeeded")
)
```

### WebMock vs VCR

| Approach | Use when | Watch out for |
| --- | --- | --- |
| WebMock stubs | You want explicit request and response control in unit or request tests | Stubs drift from the real API over time |
| VCR cassettes | You need recorded real responses for integration-style coverage | Cassettes must be sanitized and managed carefully |
| Fake service server | One external service dominates the test surface | The fake becomes a maintenance burden of its own |

## Coverage Checklist for Common Rails Failures

Cover these cases when they apply to the feature:

- Nil, blank, and boundary validation inputs.
- Unauthorized and forbidden access paths.
- Invalid parameter combinations and strong-parameter rejection.
- Uniqueness races or optimistic-locking conflicts.
- Job retries, idempotency, and side effects.
- Conditional email delivery and multipart rendering.

## Helper Conventions Worth Standardizing

### JSON Response Helper

```ruby
module JsonHelpers
  def json_response
    @json_response ||= JSON.parse(response.body, symbolize_names: true)
  end
end

# RSpec: config.include JsonHelpers, type: :request
# Minitest: include JsonHelpers in ActionDispatch::IntegrationTest
```

### Authentication Helper

Adapt this to the repo's auth strategy.

```ruby
module AuthHelpers
  def auth_headers_for(user)
    token = JWT.encode(
      { user_id: user.id, exp: 1.hour.from_now.to_i },
      Rails.application.secret_key_base
    )
    { "Authorization" => "Bearer #{token}" }
  end
end
```

## System Tests: Keep Them Small and Stable

- Limit them to JavaScript-dependent flows and high-value journeys.
- Use a headless browser setup that matches the repo's current system-test driver.
- Never use `sleep`; rely on Capybara's waiting behavior.
- Prefer resilient assertions over brittle exact-text snapshots.
- Keep browser state isolated per example.
- Preserve screenshot-on-failure support for CI diagnosis.

## Flaky Test Diagnosis

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Passes alone, fails in suite | Shared state in class variables, globals, caches, or fixtures | Reset state in setup hooks and clear leaked caches |
| Fails intermittently on CI | Ordering or timing dependency | Re-run with randomized seeds and remove implicit timing assumptions |
| System test timeout | Missing wait condition or slow JavaScript | Replace `sleep` with Capybara finders and tune wait time only when necessary |
| Different results per worker | Database leakage or worker-specific filesystem state | Re-check transaction use and worker-specific temp paths |

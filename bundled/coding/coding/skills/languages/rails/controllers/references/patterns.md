# Rails Controller Patterns

Detailed routing, params, filter, authorization, and response patterns beyond the parent skill.

## Resourceful Routing and Dedicated Controllers

Start with standard RESTful routing and only add custom routes when a new resource boundary truly exists.
Treat state changes as resources instead of growing a parent controller with one-off member actions.

```ruby
# Bad - custom actions bloat the controller
resources :cards do
  post :close
  post :reopen
end

# Good - resource controllers
resources :cards do
  scope module: :cards do
    resource :closure
    resource :pin
  end
end
```

Use shallow nesting when deeper resource trees make helpers and URLs harder to follow.
Prefer one controller per resource or transition instead of mixing unrelated resources into a single class.

## Layered Concern Example

Layered concerns can share setup and render helpers across related resource controllers without forcing unrelated actions into the same controller.

```ruby
# app/controllers/concerns/card_scoped.rb
module CardScoped
  extend ActiveSupport::Concern

  included do
    before_action :set_card, :set_board
  end

  private

  def set_card
    @card = Current.user.accessible_cards.find_by!(number: params[:card_id])
  end

  def set_board
    @board = @card.board
  end

  def render_card_replacement
    render turbo_stream: turbo_stream.replace(
      [@card, :card_container],
      partial: "cards/container",
      method: :morph,
      locals: { card: @card.reload }
    )
  end
end

# app/controllers/cards/closures_controller.rb
class Cards::ClosuresController < ApplicationController
  include CardScoped

  def create
    @card.close
    respond_to do |format|
      format.turbo_stream { render_card_replacement }
      format.json { head :no_content }
    end
  end

  def destroy
    @card.reopen
    respond_to do |format|
      format.turbo_stream { render_card_replacement }
      format.json { head :no_content }
    end
  end
end
```

## Strong Parameters

Use explicit strong-parameter methods in every mutating controller action.
On Rails 8+, prefer `params.expect`; on older versions, fall back to `require(...).permit(...)`.
Check `Gemfile.lock` before recommending the Rails 8 API.

```ruby
# Basic
params.expect(post: [:title, :content])

# Arrays
params.expect(post: [:title, tags: []])

# Nested attributes
params.expect(user: [:name, :email, profile_attributes: [:bio, :avatar]])

# Dynamic hash attributes
params.expect(product: [:name, :price, metadata: {}])

# Rails < 8
params.require(:post).permit(:title, :content)
```

Never use `params.permit!` in application code.
Keep the strong-parameter method private and scoped to the resource the controller owns.

## Filters and Authorization

Use `before_action` for authentication, authorization, and resource loading.
Apply shared filters broadly, then skip them narrowly for public endpoints instead of opting in one action at a time.

### Model-Based Authorization (omakase profile)

Use model-level authorization checks when no policy gem is installed and the repo follows omakase conventions.

```ruby
class BoardsController < ApplicationController
  before_action :set_board
  before_action :ensure_permission_to_admin_board, only: [:edit, :update, :destroy]

  private

  def ensure_permission_to_admin_board
    head :forbidden unless Current.user.can_administer_board?(@board)
  end
end

class User < ApplicationRecord
  def can_administer_board?(board)
    admin? || board.creator == self
  end
end
```

### Policy Objects (service-oriented profile)

When the app already uses Pundit or a similar gem, follow that policy layer instead of introducing model checks beside it.

```ruby
class PostPolicy < ApplicationPolicy
  def update?
    record.user == user || user.admin?
  end
end

class PostsController < ApplicationController
  def update
    @post = Post.find(params[:id])
    authorize @post
    # ...
  end
end
```

If `pundit` or `cancancan` is present, use the installed authorization stack.
If neither is present, match the repo's existing omakase checks instead of inventing a new authorization style.

## Error Handling and Status Codes

Prefer centralized `rescue_from` handlers in `ApplicationController` when the repo already uses them for common HTTP failures.

```ruby
class ApplicationController < ActionController::Base
  rescue_from ActiveRecord::RecordNotFound, with: :not_found
  rescue_from ActionPolicy::Unauthorized, with: :forbidden

  private

  def not_found
    respond_to do |format|
      format.html { render "errors/not_found", status: :not_found }
      format.json { render json: { error: "Not found" }, status: :not_found }
    end
  end

  def forbidden
    respond_to do |format|
      format.html { redirect_back fallback_location: root_path, alert: "Not authorized." }
      format.json { render json: { error: "Forbidden" }, status: :forbidden }
    end
  end
end
```

Status-code defaults:

- `422 Unprocessable Entity` for validation failures
- `404 Not Found` for missing records
- `403 Forbidden` for authorization failures
- `303 See Other` for `redirect_to` after destructive HTML actions
- `204 No Content` for successful API updates that do not need a body

## Multi-Format Responses

Keep response branching in one `respond_to` block per action when possible.
Match HTML, JSON, and Turbo behavior so success and failure cases stay aligned.

```ruby
def create
  @post = current_user.posts.build(post_params)

  respond_to do |format|
    if @post.save
      format.html { redirect_to @post, notice: "Created!" }
      format.json { render json: @post, status: :created }
      format.turbo_stream
    else
      format.html { render :new, status: :unprocessable_entity }
      format.json { render json: @post.errors, status: :unprocessable_entity }
      format.turbo_stream { render :form_errors, status: :unprocessable_entity }
    end
  end
end
```

Split API-only behavior into dedicated controllers when HTML and JSON concerns diverge too far.

## Streaming Responses

Use streaming for large exports so the controller does not build the full payload in memory.

```ruby
class ReportsController < ApplicationController
  def export
    respond_to do |format|
      format.csv do
        headers["Content-Disposition"] = 'attachment; filename="report.csv"'
        headers["Content-Type"] = "text/csv"

        self.response_body = Enumerator.new do |yielder|
          yielder << CSV.generate_line(["ID", "Name", "Email"])
          User.find_each do |user|
            yielder << CSV.generate_line([user.id, user.name, user.email])
          end
        end
      end
    end
  end
end
```

## Context Awareness Reference

| Pattern | Detect with | Use when |
|---|---|---|
| Dedicated resource controllers | Custom member actions in `config/routes.rb` | A state transition or side effect deserves its own resource boundary |
| Layered controller concerns | Shared setup in `app/controllers/concerns/` or repeated `before_action` logic | Multiple related controllers need the same loading or rendering helpers |
| `params.expect` | Rails 8+ in `Gemfile.lock` | The app supports the newer strong-parameter API |
| Model-based authorization | No Pundit or CanCanCan gem and an omakase-style repo | Authorization rules already live with the domain objects |
| Policy-object authorization | `pundit`, `cancancan`, or similar gems in `Gemfile` | The repo already centralizes authorization outside the model |
| Streaming responses | Export endpoints or large generated payloads | Building the whole response in memory would be wasteful |

## Detection Checklist

Use a quick scan before recommending controller patterns:

1. Check `AGENTS.md`, `agents.md`, `README.md`, and local architecture docs for routing, auth, and response conventions.
2. Check `Gemfile.lock` for the Rails version before using `params.expect`.
3. Check `Gemfile` for `pundit` or `cancancan` before suggesting authorization patterns.
4. Check `config/routes.rb` for custom member actions that should become dedicated resource controllers.
5. Check existing controllers for `respond_to`, pagination, serialization, and `rescue_from` conventions.

## Best Practices

### Do

- Delegate business logic out of controllers according to the detected stack profile.
- Prefer dedicated resource controllers over growing custom member actions.
- Use layered concerns for shared setup logic across related controllers.
- Keep routing shallow and responses explicit.
- Match the repo's installed auth, pagination, and serialization patterns.

### Don't

- Suggest model-based authorization when Pundit or CanCanCan is already installed.
- Suggest `params.expect` on Rails versions that do not support it.
- Nest routes more than one level deep without a strong reason.
- Scatter duplicated `respond_to` blocks or ad-hoc error payloads across controllers.
- Leave business workflows or persistence rules sitting in controller actions.

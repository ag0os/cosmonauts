# Data Structures: When to Graduate

## Graduation path: Hash -> Struct -> Data -> Class

### Hash: ad-hoc or temporary data

Use a `Hash` when the structure is throwaway or highly local. Graduate when the same keys are accessed repeatedly, when the value travels through multiple methods, or when the data needs behavior.

### Struct: named data with optional behavior

```ruby
Point = Struct.new(:x, :y, keyword_init: true)
point = Point.new(x: 10, y: 20)

Point = Struct.new(:x, :y, keyword_init: true) do
  def distance_from_origin = Math.sqrt(x**2 + y**2)
end
```

Use `Struct` when named fields and lightweight behavior are enough, especially on older Ruby versions or when mutability is acceptable.

### Data: immutable value objects on Ruby 3.2+

`Data.define` is the default choice for immutable value objects.

```ruby
Point = Data.define(:x, :y) do
  def distance_from_origin = Math.sqrt(x**2 + y**2)
  def translate(dx, dy) = with(x: x + dx, y: y + dy)
end

point = Point.new(x: 3, y: 4)
moved = point.translate(1, 1)
```

`Data` provides value equality, a `with` method for copy-on-write updates, and keyword initialization by default.

### Frozen Struct: pre-3.2 immutable fallback

```ruby
Point = Struct.new(:x, :y, keyword_init: true) do
  def initialize(*) = (super; freeze)
  def translate(dx, dy) = Point.new(x: x + dx, y: y + dy)
end
```

Use this when the project needs immutable value objects but cannot rely on Ruby 3.2 yet.

### Class: only when you need full control

Graduate to a class when you need private state, complex initialization, constructor validation, or lifecycle management that does not fit a data carrier.

## Common value object patterns

### Money

```ruby
Money = Data.define(:amount, :currency) do
  def +(other)
    raise "Currency mismatch" unless currency == other.currency

    with(amount: amount + other.amount)
  end

  def to_s = "#{currency} #{amount}"
end
```

### Result object

```ruby
Result = Data.define(:success, :value, :error) do
  def self.success(value) = new(success: true, value: value, error: nil)
  def self.failure(error) = new(success: false, value: nil, error: error)

  def success? = success
  def failure? = !success
end
```

## Quick decision guide

```text
Temporary or one-off data? -> Hash
Named structure with accessors? -> Struct
Immutable value object on Ruby 3.2+? -> Data
Complex initialization, private state, or lifecycle? -> Class
```

Always check `.ruby-version` or `Gemfile` before recommending `Data.define`.

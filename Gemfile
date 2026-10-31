source "https://rubygems.org"

# Local development only. GitHub Pages builds the live site with its own
# pinned Jekyll, so keep templates plain Liquid (no custom plugins).
#
# Every gem — direct and transitive — is pinned to an exact version in
# Gemfile.pins. Don't edit pins or run `bundle update` by hand: use
# `scripts/update-gems.rb`, which only allows releases at least 14 days old.

PINS = File.readlines(File.join(__dir__, "Gemfile.pins"), chomp: true, encoding: "UTF-8")
  .reject { |line| line.strip.empty? || line.start_with?("#") }
  .to_h { |line| name, op, version = line.split; [name, "#{op} #{version}"] }

def pinned(name, *requirements)
  gem name, *requirements, *PINS[name]
end

pinned "jekyll", "~> 4.4"

group :jekyll_plugins do
  pinned "jekyll-feed", "~> 0.17"
end

# Removed from Ruby's default gems in 3.x/4.x but still required by Jekyll.
pinned "webrick"
pinned "csv"
pinned "base64"
pinned "bigdecimal"
pinned "logger"

# Pin transitive dependencies too.
DIRECT = %w[jekyll jekyll-feed webrick csv base64 bigdecimal logger]
(PINS.keys - DIRECT).each { |name| gem name, PINS[name], require: false }

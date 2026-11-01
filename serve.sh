#!/usr/bin/env bash
# Spin up the site locally at http://localhost:3250 with live reload.
# Usage: ./serve.sh            (first run installs gems into ./vendor)
set -euo pipefail
cd "$(dirname "$0")"

PORT="${PORT:-3250}"

# macOS ships Ruby 2.6, which is too old for Jekyll 4 — prefer Homebrew's Ruby.
if [ -x /opt/homebrew/opt/ruby/bin/ruby ]; then
  export PATH="/opt/homebrew/opt/ruby/bin:$PATH"
elif [ -x /usr/local/opt/ruby/bin/ruby ]; then
  export PATH="/usr/local/opt/ruby/bin:$PATH"
else
  echo "Homebrew Ruby not found. Install it with: brew install ruby" >&2
  exit 1
fi

export BUNDLE_PATH=vendor/bundle
bundle check >/dev/null 2>&1 || bundle install

exec bundle exec jekyll serve --port "$PORT" --livereload --livereload-port 35250 "$@"

.PHONY: build
build:
	@docker run --rm -v "$$PWD:/srv/jekyll" -p 8080:8080 -it jekyll/jekyll:latest /bin/sh -c " \
		rm -f Gemfile.lock; \
		bundle install; \
		bundle exec jekyll serve -H 0.0.0.0 -P 8080 \
	"
.PHONY: clean
clean:
	rm -rf _site/
	rm -rf .sass-cache/
	rm -rf .jekyll-cache/
	rm -rf .jekyll-metadata
	rm -rf .bundle/
	rm -rf vendor/
	rm -f Gemfile.lock

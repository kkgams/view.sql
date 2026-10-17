WIKI_VERSION := v1.4.0
WIKI_REPOSITORY := https://github.com/justgook/wiki
WIKI_MAKEFILE := build/wiki-$(WIKI_VERSION).mk
WIKI_ENGINE := $(abspath build/wiki-$(WIKI_VERSION))
PORT ?= 8080

.PHONY: test package serve-docs validate-docs build-docs

test:
	npm test

package:
	npm run package

$(WIKI_MAKEFILE):
	mkdir -p "$(@D)"
	curl --fail --location --retry 3 "$(WIKI_REPOSITORY)/raw/$(WIKI_VERSION)/Makefile" -o "$@.tmp"
	mv "$@.tmp" "$@"

serve-docs validate-docs build-docs: $(WIKI_MAKEFILE)
	$(MAKE) -f "$(WIKI_MAKEFILE)" "$(patsubst %-docs,%,$@)" WIKI_REPOSITORY="$(WIKI_REPOSITORY)" WIKI_VERSION="$(WIKI_VERSION)" WIKI_ENGINE="$(WIKI_ENGINE)" WIKI_SOURCE="$(abspath docs)" WIKI_OUTPUT="$(abspath build/site)" PORT="$(PORT)"

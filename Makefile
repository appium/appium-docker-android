NAME := appium
VERSION := $(or $(VERSION),$(VERSION),1.0-arsenal)
MAJOR := $(word 1,$(subst ., ,$(VERSION)))
MINOR := $(word 2,$(subst ., ,$(VERSION)))

all: Appium AppiumEmulator

build: all

Appium:
	cd ./Appium && docker build -t $(NAME)/appium:$(VERSION) .

AppiumEmulator:
	cd ./AppiumEmulator && docker build -t $(NAME)/appium-emulator:$(VERSION) .

tag_latest:
	docker tag $(NAME)/appium:$(VERSION) $(NAME)/appium:latest
	docker tag $(NAME)/appium-emulator:$(VERSION) $(NAME)/appium-emulator:latest

release_latest:
	docker push $(NAME)/appium:latest
	docker push $(NAME)/appium-emulator:latest

tag_major_minor:
	docker tag $(NAME)/appium:$(VERSION) $(NAME)/appium:$(MAJOR)
	docker tag $(NAME)/appium-emulator:$(VERSION) $(NAME)/appium-emulator:$(MAJOR)
	docker tag $(NAME)/appium:$(VERSION) $(NAME)/appium:$(MINOR)
	docker tag $(NAME)/appium-emulator:$(VERSION) $(NAME)/appium-emulator:$(MINOR)

release: tag_major_minor
	@if ! docker images $(NAME)/appium | awk '{ print $$2 }' | grep -q -F $(VERSION); then echo "$(NAME)/appium version $(VERSION) is not yet built. Please run 'make build'"; false; fi
	@if ! docker images $(NAME)/appium-emulator | awk '{ print $$2 }' | grep -q -F $(VERSION); then echo "$(NAME)/appium-emulator version $(VERSION) is not yet built. Please run 'make build'"; false; fi
	docker push $(NAME)/appium:$(VERSION)
	docker push $(NAME)/appium-emulator:$(VERSION)
	docker push $(NAME)/appium:$(MAJOR)
	docker push $(NAME)/appium-emulator:$(MAJOR)
	docker push $(NAME)/appium:$(MAJOR).$(MINOR)
	docker push $(NAME)/appium-emulator:$(MAJOR).$(MINOR)

.PHONY: \
	all \
	build \
	Appium \
	AppiumEmulator \
	release	\
	tag_latest

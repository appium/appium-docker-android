NAME := appium
VERSION := $(or $(VERSION),$(VERSION),1.0.0-arsenal)
BUILD_ARGS := $(BUILD_ARGS)
MAJOR := $(word 1,$(subst ., ,$(VERSION)))
MINOR := $(word 2,$(subst ., ,$(VERSION)))
MAJOR_MINOR_PATCH := $(word 1,$(subst -, ,$(VERSION)))

all: Appium AppiumEmulator

build: all

Appium:
	cd ./Appium && docker build $(BUILD_ARGS) -t $(NAME)/appium:$(VERSION) .

AppiumEmulator:
	cd ./AppiumEmulator && docker build $(BUILD_ARGS) -t $(NAME)/appium-emulator:$(VERSION) .

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
	docker tag $(NAME)/appium:$(VERSION) $(NAME)/appium::$(MAJOR_MINOR_PATCH)
	docker tag $(NAME)/appium-emulator:$(VERSION) $(NAME)/appium-emulator::$(MAJOR_MINOR_PATCH)

release: tag_major_minor
	@if ! docker images $(NAME)/appium | awk '{ print $$2 }' | grep -q -F $(VERSION); then echo "$(NAME)/appium version $(VERSION) is not yet built. Please run 'make build'"; false; fi
	@if ! docker images $(NAME)/appium-emulator | awk '{ print $$2 }' | grep -q -F $(VERSION); then echo "$(NAME)/appium-emulator version $(VERSION) is not yet built. Please run 'make build'"; false; fi
	docker push $(NAME)/appium:$(VERSION)
	docker push $(NAME)/appium-emulator:$(VERSION)
	docker push $(NAME)/appium:$(MAJOR)
	docker push $(NAME)/appium-emulator:$(MAJOR)
	docker push $(NAME)/appium:$(MAJOR).$(MINOR)
	docker push $(NAME)/appium-emulator:$(MAJOR).$(MINOR)
	docker push $(NAME)/appium:$(MAJOR_MINOR_PATCH)
	docker push $(NAME)/appium-emulator:$(MAJOR_MINOR_PATCH)

.PHONY: \
	all \
	build \
	Appium \
	AppiumEmulator \
	release	\
	tag_latest

NAME := appium
VERSION := latest

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

.PHONY: \
	all \
	build \
	Appium \
	AppiumEmulator \
	tag_latest

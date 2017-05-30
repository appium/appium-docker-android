#!/bin/bash

if [ -z "$PLATFORM"]; then
  PLATFORM="Android"
fi

if [ -z "$PLATFORM_NAME" ]; then
  PLATFORM_NAME="Android"
fi

if [ -z "$APPIUM_HOST" ]; then
  APPIUM_HOST="127.0.0.1"
fi

if [ -z "$APPIUM_PORT" ]; then
  APPIUM_PORT=4723
fi

if [ -z "$SELENIUM_HOST" ]; then
  SELENIUM_HOST="172.17.0.1"
fi

if [ -z "$SELENIUM_PORT" ]; then
  SELENIUM_PORT=4444
fi

if [ -z "$BROWSER_NAME" ]; then
  BROWSER_NAME="android"
fi

if [ -z "$OS_VERSION" ]; then
  OS_VERSION="7.1.1"
fi

if [ -z "$DEVICE_NAME" ]; then
  DEVICE_NAME="Android Phone"
fi

cat <<_EOF
{
  "capabilities": [{
      "platformName": "$PLATFORM_NAME",
      "version": "$OS_VERSION",
      "browserName": "$BROWSER_NAME",
      "deviceName": "$DEVICE_NAME",
      "maxInstances": 1
  }],
  "configuration": {
    "cleanUpCycle": 2000,
    "timeout": 30000,
    "proxy": "org.openqa.grid.selenium.proxy.DefaultRemoteProxy",
    "url": "http://$APPIUM_HOST:$APPIUM_PORT/wd/hub",
    "host": "$APPIUM_HOST",
    "port": $APPIUM_PORT,
    "maxSession": 6,
    "register": true,
    "registerCycle": 5000,
    "hubHost": "$SELENIUM_HOST",
    "hubPort": $SELENIUM_PORT
  }
}
_EOF

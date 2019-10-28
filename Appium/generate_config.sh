#!/bin/bash

node_config_json=$1

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

if [ -z "$DEVICE_UNIQUE_ID" ]; then
  DEVICE_UNIQUE_ID=""
fi

if [ ! -z "$REMOTE_ADB" ]; then
    if [ ! -z "$ANDROID_DEVICES" ]; then
        IFS=',' read -r -a array <<< "$ANDROID_DEVICES"
        for i in "${!array[@]}"
        do
            echo "Connecting to: ${array[$i]}"
            adb connect ${array[$i]}
            echo "Success!"
        done
        #Give time to finish connection
        sleep 1
    fi
fi

#Get device names
devices=($(adb devices | grep -oP "\K([^ ]+)(?=\sdevice(\W|$))"))
echo "Devices found: ${#devices[@]}"

#Create capabilities json configs
function create_capabilities() {
  capabilities=""
  for name in ${devices[@]}; do
    os_version="$(adb -s $name shell getprop ro.build.version.release | tr -d '\r')"
    chrome_version="$(adb -s $name shell dumpsys package com.android.chrome | grep versionName -m1 | tr -d "versionName=" | sed -r 's/\s+//g')"
    capabilities+=$(cat <<_EOF
{
    "deviceUniqueId": "$DEVICE_UNIQUE_ID",
    "platform": "$PLATFORM_NAME",
    "platformName": "$PLATFORM_NAME",
    "version": "$chrome_version",
    "browserName": "chrome",
    "deviceName": "$name",
    "maxInstances": 1
  },
  {
    "deviceUniqueId": "$DEVICE_UNIQUE_ID",
    "platform": "$PLATFORM_NAME",
    "platformName": "$PLATFORM_NAME",
    "version": "$os_version",
    "browserName": "android",
    "deviceName": "$name",
    "maxInstances": 1
  }
_EOF
    )
    if [ ${devices[-1]} != $name ]; then
      capabilities+=', '
    fi
  done
  echo "$capabilities"
}

#Final node configuration json string
nodeconfig=$(cat <<_EOF
{
  "capabilities": [$(create_capabilities)],
  "configuration": {
    "cleanUpCycle": 5000,
    "timeout": 19000,
    "proxy": "com.pvh.proxy.NoAppiumRemoteProxy",
    "url": "http://$APPIUM_HOST:$APPIUM_PORT/wd/hub",
    "host": "$APPIUM_HOST",
    "port": $APPIUM_PORT,
    "maxSession": 1,
    "register": true,
    "registerCycle": 5000,
    "hubHost": "$SELENIUM_HOST",
    "hubPort": $SELENIUM_PORT,
    "nodePolling": 93000,
    "nodeStatusCheckTimeout": 5000,
    "unregisterIfStillDownAfter": 2500
  }
}
_EOF
)
echo "$nodeconfig" > $node_config_json

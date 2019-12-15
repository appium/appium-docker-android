#!/bin/bash

NODE_CONFIG_JSON="/root/nodeconfig.json"
DEFAULT_CAPABILITIES_JSON="/root/defaultcapabilities.json"
APPIUM_LOG="/var/log/appium.log"
CMD="xvfb-run appium --log $APPIUM_LOG"

if [ ! -z "$USB_BUS" ]; then
    try="0"
    while [ $try -lt 3 ]; do
        /root/usbreset $USB_BUS
        devices=($(adb devices | grep -oP "\K([^ ]+)(?=\sdevice(\W|$))"))
        count=${#devices[@]}
        if (( $count < 1 )); then
             echo "Try to reset usb: $try"
             sleep 1
             try=$[$try+1]
        else
             break;
        fi
    done
fi  

if [ "$CONNECT_TO_GRID" = true ]; then
    if [ "$CUSTOM_NODE_CONFIG" != true ]; then
        /root/generate_config.sh $NODE_CONFIG_JSON
    fi
    CMD+=" --nodeconfig $NODE_CONFIG_JSON"
fi

if [ "$DEFAULT_CAPABILITIES" = true ]; then
    CMD+=" --default-capabilities $DEFAULT_CAPABILITIES_JSON"
fi

if [ "$RELAXED_SECURITY" = true ]; then
    CMD+=" --relaxed-security"
fi

pkill -x xvfb-run
rm -rf /tmp/.X99-lock

$CMD

#!/bin/bash

NODE_CONFIG_JSON="/root/nodeconfig.json"
DEFAULT_CAPABILITIES_JSON="/root/defaultcapabilities.json"
APPIUM_LOG="/var/log/appium.log"
CMD="xvfb-run appium --log $APPIUM_LOG"

if [ ! -z "$USB_BUS" ]; then
    /root/usbreset $USB_BUS
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

#!/bin/bash

NODE_CONFIG_JSON="/root/nodeconfig.json"
APPIUM_LOG="/var/log/appium.log"
CMD="xvfb-run appium --log $APPIUM_LOG"

if [ "$REMOTE_ADB" = true ]; then
	/root/wireless_connect.sh
fi

if [ "$CONNECT_TO_GRID" = true ]; then
    if [ "$CUSTOM_NODE_CONFIG" != true ]; then
		/root/generate_config.sh $NODE_CONFIG_JSON
	fi
	CMD+=" --nodeconfig $NODE_CONFIG_JSON"
fi

if [ "$RELAXED_SECURITY" = true ]; then
	CMD+=" --relaxed-security"
fi

pkill -x xvfb-run

$CMD

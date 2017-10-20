#!/bin/bash

NODE_CONFIG_JSON="/root/nodeconfig.json"
CMD="xvfb-run appium"

if [ ! -z "$REMOTE_ADB" ]; then
    /root/wireless_connect.sh
fi

if [ ! -z "$CONNECT_TO_GRID" ]; then
  /root/generate_config.sh $NODE_CONFIG_JSON
  CMD+=" --nodeconfig $NODE_CONFIG_JSON"
fi

pkill -x xvfb-run

$CMD

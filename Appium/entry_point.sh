#!/bin/bash

NODE_CONFIG_JSON="/root/nodeconfig.json"
CMD="xvfb-run appium"

if [ ! -z "$REMOTE_ADB" ]; then
    if [ -z "$REMOTE_ADB_POLLING_SEC" ]; then
      REMOTE_ADB_POLLING_SEC=5
    fi
    /root/wireless_connect.sh
    #run regular check of connected devices
    nohup watch -n ${REMOTE_ADB_POLLING_SEC} /root/wireless_connect.sh
fi

if [ ! -z "$CONNECT_TO_GRID" ]; then
  /root/generate_config.sh $NODE_CONFIG_JSON
  CMD+=" --nodeconfig $NODE_CONFIG_JSON"
fi

pkill -x xvfb-run

$CMD

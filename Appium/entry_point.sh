#!/bin/bash

NODE_CONFIG_JSON="/root/nodeconfig.json"
CMD="xvfb-run appium"

function generate_node_config() {
  if [ -z "$CUSTOM_NODE_CONFIG" ]; then
    /root/generate_config.sh $NODE_CONFIG_JSON
  fi
}

if [ ! -z "$REMOTE_ADB" ]; then
  /root/wireless_connect.sh
fi

if [ ! -z "$CONNECT_TO_GRID" ]; then
  generate_node_config
  CMD+=" --nodeconfig $NODE_CONFIG_JSON"
fi

pkill -x xvfb-run

$CMD

#!/bin/bash

CONFIG="/root/nodeconfig.json"
CMD="xvfb-run appium"

if [ ! -z "$CONNECT_TO_GRID" ]; then
  /root/generate_config.sh > $CONFIG
  CMD+=" --nodeconfig $CONFIG"
fi

$CMD

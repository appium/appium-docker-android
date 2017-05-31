#!/bin/bash

JSON="/root/nodeconfig.json"
CMD="xvfb-run appium"

if [ ! -z "$CONNECT_TO_GRID" ]; then
  /root/generate_config.sh $JSON
  CMD+=" --nodeconfig $JSON"
fi

$CMD

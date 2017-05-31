#!/usr/bin/env bats

default_config=\
'{
  "capabilities": [],
  "configuration": {
    "cleanUpCycle": 2000,
    "timeout": 30000,
    "proxy": "org.openqa.grid.selenium.proxy.DefaultRemoteProxy",
    "url": "http://127.0.0.1:4723/wd/hub",
    "host": "127.0.0.1",
    "port": 4723,
    "maxSession": 6,
    "register": true,
    "registerCycle": 5000,
    "hubHost": "172.17.0.1",
    "hubPort": 4444
  }
}'
json="/root/nodeconfig.json"

teardown() {
  adb kill-server
}

@test 'Verify selenium grid config is created' {
  run /root/generate_config.sh $json
  [ "$(cat $json)" == "$default_config" ]
}

#!/bin/bash

#Install bats
echo "Installing Bats before test execution"
npm install bats@0.4.2
npm install bats-mock@1.0.1

#Run tests
./node_modules/.bin/bats /root/tests/*.bats

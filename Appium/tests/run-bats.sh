#!/bin/bash

#Install bats
echo "Installing Bats before test execution"
/root/tests/helpers/bats/install.sh /usr/local

#Run tests
bats /root/tests/*.bats

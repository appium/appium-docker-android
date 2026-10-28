#!/bin/bash

# Connect device via wireless
if [ "${REMOTE_ADB}" = true ]; then
	echo "Connect device via wireless"
	# Avoid lost connection
	${APP_PATH}/wireless_autoconnect.sh && \
	${APP_PATH}/wireless_connect.sh
fi

# Command to start Appium
APPIUM_LOG="${APPIUM_LOG:-/var/log/appium.log}"
command="xvfb-run appium --log $APPIUM_LOG"

# Install and enable Appium plugins if needed
if [ -n "${APPIUM_PLUGINS}" ]; then
	IFS=',' read -r -a plugins <<<"${APPIUM_PLUGINS}"
	use_plugins=()
	for i in "${!plugins[@]}"; do
		plugin=$(echo "${plugins[$i]}" | tr -d " ")
		if [ -n "${plugin}" ]; then
			echo "Installing Appium plugin: ${plugin}"
			appium plugin install "${plugin}" || true
			use_plugins+=("${plugin%%@*}")
		fi
	done
	if [ ${#use_plugins[@]} -gt 0 ] && [[ "${APPIUM_ADDITIONAL_PARAMS}" != *"--use-plugins"* ]]; then
		plugins_arg=$(IFS=','; echo "${use_plugins[*]}")
		command+=" --use-plugins ${plugins_arg}"
	fi
fi

if [ "${DEFAULT_CAPABILITIES}" = true ]; then
	DEFAULT_CAPABILITIES_JSON="${APP_PATH}/defaultcapabilities.json"
	command+=" --default-capabilities ${DEFAULT_CAPABILITIES_JSON}"
fi

# Adding additional Appium configuration if needed
command+=" ${APPIUM_ADDITIONAL_PARAMS}"

# Run the whole command
pkill -x xvfb-run
rm -rf /tmp/.X99-lock
${command}

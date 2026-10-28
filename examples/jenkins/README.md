# Running in Jenkins (Kubernetes Plugin)

When running `appium/appium` inside a Jenkins Kubernetes pod and executing `sh` steps via `container('appium') { ... }`:

1. **Override `command` with `cat` and `tty: true`**: The image sets `ENTRYPOINT ["sh", "-c"]` and `CMD ["${WORK_PATH}/${SCRIPT_PATH}/start.sh"]`. For the Jenkins Kubernetes plugin to attach and run `sh` steps inside the `appium` container without hanging, configure `command: ["cat"]` and `tty: true` on the container spec, then invoke `"${WORK_PATH}/${SCRIPT_PATH}/start.sh"` from your `sh` step.
2. **Mount ADB keys to `/home/androidusr/.android`**: The container runs as the non-root user `androidusr` (`UID 1300`), so mount the `.android` secret volume at `/home/androidusr/.android` rather than `/root/.android`, and set `APPIUM_LOG=/tmp/appium.log`.
3. **Pass container environment variables**: Configure `REMOTE_ADB`, `ANDROID_DEVICES`, `APPIUM_PLUGINS`, or `APPIUM_ADDITIONAL_PARAMS` in the container `env` block before running `"${WORK_PATH}/${SCRIPT_PATH}/start.sh"`.

See [`Jenkinsfile`](Jenkinsfile) for a complete declarative pipeline example.

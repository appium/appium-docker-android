FROM ubuntu:noble@sha256:c4a8d5503dfb2a3eb8ab5f807da5bc69a85730fb49b5cfca2330194ebcc41c7b AS android_img

#==================
# General Packages
#------------------
# ca-certificates
#   SSL client
# openjdk-25-jdk
#   Java
# unzip
#   Unzip zip file
# wget
#   Network downloader
#==================
RUN apt-get -qqy update && \
    apt dist-upgrade -y && \
    apt-get -qqy --no-install-recommends install \
    ca-certificates \
    openjdk-25-jdk \
    unzip \
    wget \
  && rm -rf /var/lib/apt/lists/*

#===============
# Set JAVA_HOME
#===============
ENV JAVA_HOME="/usr/lib/jvm/java-25-openjdk-amd64"
ENV PATH=$PATH:${JAVA_HOME}/bin

#================
# Set up Android
#================
ENV SDK_VERSION=commandlinetools-linux-13114758_latest
ENV ANDROID_BUILD_TOOLS_VERSION=36.0.0
ENV ANDROID_CMD=cmdline-tools
ENV ANDROID_HOME=/opt/android
ENV ANDROID_CMD_HOME=/opt/android/${ANDROID_CMD}
ENV ANDROID_TOOL_HOME=${ANDROID_CMD_HOME}/tools
ENV PATH=$PATH:${ANDROID_TOOL_HOME}:${ANDROID_TOOL_HOME}/bin

RUN wget -O tools.zip https://dl.google.com/android/repository/${SDK_VERSION}.zip && \
    unzip tools.zip && rm tools.zip && \
    mkdir -p ${ANDROID_CMD_HOME}/tools && \
    mv ${ANDROID_CMD}/* ${ANDROID_TOOL_HOME}/ && \
    rm -rf ${ANDROID_CMD} && \
    echo y | sdkmanager "platform-tools" && \
    echo y | sdkmanager "build-tools;$ANDROID_BUILD_TOOLS_VERSION"

FROM ubuntu:noble@sha256:c4a8d5503dfb2a3eb8ab5f807da5bc69a85730fb49b5cfca2330194ebcc41c7b

ENV DEBIAN_FRONTEND=noninteractive

#==================
# General Packages
#------------------
# libqt5webkit5
#   Web content engine (Fix issue in Android)
# openjdk-25-jdk
#   Java
# tzdata
#   Timezone
# xvfb
#   X virtual framebuffer
#==================
RUN apt-get -qqy update && \
    apt dist-upgrade -y && \
    apt-get -qqy --no-install-recommends install \
    libqt5webkit5 \
    openjdk-25-jdk \
    tzdata \
    xvfb \
  && rm -rf /var/lib/apt/lists/*

#===============================
# Set Timezone (UTC as default)
#===============================
ENV TZ="UTC"
RUN echo "${TZ}" > /etc/timezone \
  && dpkg-reconfigure --frontend noninteractive tzdata

#=====================
# Set up needed tools
#=====================
ENV JAVA_HOME="/usr/lib/jvm/java-25-openjdk-amd64"
ENV PATH=$PATH:${JAVA_HOME}/bin

ENV ANDROID_HOME=/opt/android
COPY --from=android_img ${ANDROID_HOME} ${ANDROID_HOME}
ENV PATH=${PATH}:\
${ANDROID_HOME}/cmdline-tools/tools:\
${ANDROID_HOME}/cmdline-tools/tools/bin:\
${ANDROID_HOME}/platform-tools:\
${ANDROID_HOME}/build-tools

COPY --from=node:24.14.0-slim /usr/local /usr/local

#===============
# Create a user
#===============
ARG USERNAME=androidusr
ENV USERNAME=${USERNAME}
ARG USERPASS=secret
ARG USERID=1300
ENV USERID=${USERID}
ARG GROUPID=1301
ENV GROUPID=${GROUPID}
RUN groupadd ${USERNAME} \
         --gid ${GROUPID} \
  && useradd ${USERNAME} \
         --uid ${USERID} \
         --gid ${GROUPID} \
         --create-home \
         --shell /bin/bash \
  && echo ${USERNAME}:${USERPASS} | chpasswd

#================
# Install Appium
#================
ENV APPIUM_VERSION=3.2.2
RUN npm install -g appium@${APPIUM_VERSION}

#====================================================
# Fix permission issue to download e.g. chromedriver
#====================================================
RUN chown -R ${USERID}:${GROUPID} /usr/local/lib/node_modules/appium

#========================
# Install Appium drivers
#========================
ENV WORK_PATH=/home/${USERNAME}
WORKDIR ${WORK_PATH}
USER ${USERID}:${GROUPID}

ENV APPIUM_DRIVER_ESPRESSO_VERSION="7.0.0"
ENV APPIUM_DRIVER_FLUTTER_VERSION="3.5.0"
ENV APPIUM_DRIVER_GECKO_VERSION="2.1.12"
ENV APPIUM_DRIVER_UIAUTOMATOR2_VERSION="7.0.0"
RUN appium driver install --source=npm appium-espresso-driver@${APPIUM_DRIVER_ESPRESSO_VERSION} && \
    appium driver install --source=npm appium-flutter-driver@${APPIUM_DRIVER_FLUTTER_VERSION} && \
    appium driver install --source=npm appium-geckodriver@${APPIUM_DRIVER_GECKO_VERSION} && \
    appium driver install --source=npm appium-uiautomator2-driver@${APPIUM_DRIVER_UIAUTOMATOR2_VERSION}

#================
# Set up project
#================
ENV SCRIPT_PATH="appium-docker-android"
RUN mkdir -p .android && \
    touch ~/.android/repositories.cfg && \
    mkdir -p ${SCRIPT_PATH}
COPY --chown=${USERID}:${GROUPID} . ${SCRIPT_PATH}/
ENV APP_PATH=/home/${USERNAME}/${SCRIPT_PATH}

#===============
# Expose Port
#---------------
# 4723
#   Appium port
#===============
EXPOSE 4723

#==============
# Start script
#==============
ENTRYPOINT ["sh", "-c"]
CMD ["${WORK_PATH}/${SCRIPT_PATH}/start.sh"]

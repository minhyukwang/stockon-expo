module.exports = {
  expo: {
    name: '스탁온',
    slug: 'stockon-expo',
    owner: 'thinkingcat',
    version: '1.0.0',
    icon: './assets/icon.png',
    orientation: 'portrait',
    userInterfaceStyle: 'light',
    newArchEnabled: true,
    assetBundlePatterns: ['**/*'],
    runtimeVersion: '1.0.0',
    ios: {
      icon: './assets/icon.png',
      supportsTablet: true,
      bundleIdentifier: 'com.thinkingcat.stockon',
      buildNumber: '1',

      backgroundColor: '#4bbcca',
      userInterfaceStyle: 'light',
      splash: {
        image: './assets/splash-icon.png',
        resizeMode: 'contain',
        backgroundColor: '#ffffff',
      },
      infoPlist: {
        CFBundleDisplayName: '스탁온',
        NSCameraUsageDescription: '스탁온 앱의 기능을 원활하게 이용하기 위해 카메라 촬영 권한이 필요합니다.',
        NSMicrophoneUsageDescription: '스탁온 앱의 기능을 원활하게 이용하기 위해 마이크 사용 권한이 필요합니다.',
        UIBackgroundModes: ['remote-notification'],
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/icon.png',
        backgroundColor: '#ffffff',
      },
      edgeToEdgeEnabled: true,
      package: 'com.thinkingcat.stockon',
      versionCode: 1,
      backgroundColor: '#ffffff',
      permissions: [
        'INTERNET',
        'RECEIVE_BOOT_COMPLETED',
        'WAKE_LOCK',
        'VIBRATE',
        'USE_FINGERPRINT',
        'USE_BIOMETRIC',
        'CAMERA',
        'RECORD_AUDIO',
      ],
      softwareKeyboardLayoutMode: 'pan',
    },
    androidStatusBar: {
      backgroundColor: '#ffffff',
      barStyle: 'dark-content',
      translucent: true,
    },
    web: {
      favicon: './assets/favicon.png',
      icon: './assets/icon.png',
    },
    notification: {
      icon: './assets/notification-icon.png',
      color: '#485938',
    },
    plugins: [
      [
        'expo-splash-screen',
        {
          image: './assets/splash-icon.png',
          resizeMode: 'contain',
          backgroundColor: '#ffffff',
        },
      ],
      [
        'expo-notifications',
        {
          icon: './assets/notification-icon.png',
          color: '#485938',
          sounds: [],
          mode: 'production',
        },
      ],
    ],
    extra: {
      eas: {
        projectId: '3ace716e-143f-4ff6-88c5-a6cd9d9d09f0',
      },
    },
    updates: {
      url: 'https://u.expo.dev/3ace716e-143f-4ff6-88c5-a6cd9d9d09f0',
    },
  },
};

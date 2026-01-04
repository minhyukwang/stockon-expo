import React, { useRef, useEffect, useState } from 'react';
import {
  BackHandler,
  SafeAreaView,
  View,
  Platform,
  StatusBar,
  Linking,
  ActivityIndicator,
  StyleSheet,
  Text,
  AppState
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';

const STATUS_BAR_COLOR = '#121212';

// 스플래시 화면을 자동으로 숨기지 않도록 설정
SplashScreen.preventAutoHideAsync();

// Expo Go에서는 알림 기능이 지원되지 않으므로 조건부로 처리
const isExpoGo = Constants.executionEnvironment === 'storeClient';

// expo-notifications를 조건부로 import
// 주의: Expo Go에서는 SDK 53+부터 푸시 알림이 제거되어 경고가 나타날 수 있지만,
// Development Build나 Production Build에서는 정상적으로 작동합니다.
let Notifications = null;
if (!isExpoGo) {
  // Development Build나 Production Build에서만 import
  try {
    Notifications = require('expo-notifications');
    // 알림 설정
    if (Notifications && Notifications.setNotificationHandler) {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: false,
          shouldSetBadge: true,
        }),
      });
    }
  } catch (error) {
    // Expo Go 환경이나 모듈 로드 실패 시 무시
    console.log('expo-notifications를 사용할 수 없습니다.');
  }
}

// expo-updates를 조건부로 import
let Updates = null;
if (!isExpoGo) {
  try {
    Updates = require('expo-updates');
  } catch (error) {
    console.log('expo-updates를 사용할 수 없습니다.');
  }
}

const App = () => {
  const webViewRef = useRef(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [expoPushToken, setExpoPushToken] = useState('');
  const notificationListener = useRef();
  const responseListener = useRef();
  const [currentUserId, setCurrentUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [retryCount, setRetryCount] = useState(0);
  const [webViewError, setWebViewError] = useState(false);
  const [appIsReady, setAppIsReady] = useState(false);
  const appState = useRef(AppState.currentState);
  const [isWebViewReady, setIsWebViewReady] = useState(false);
  const webViewReadyRef = useRef(false); // AppState 타이밍 대응을 위한 ref
  const [webViewKey, setWebViewKey] = useState(0); // WebView를 강제로 재마운트하기 위한 key
  const isReloadingRef = useRef(false); // reload 중복 방지 플래그
  const lastBackgroundTime = useRef(null); // 백그라운드 진입 시간 추적


  // WebView 에러 핸들러
  const handleWebViewError = () => {
    console.log('❌ WebView 로드 에러 발생');
    setWebViewError(true);
    setLoading(false);
    setAppIsReady(true); // 에러 발생 시에도 스플래시 숨기기

    // 자동 재시도 로직 (최대 3회)
    if (retryCount < 3) {
      setTimeout(() => {
        console.log('🔄 Retrying WebView load...', `Attempt ${retryCount + 1}/3`);
        setRetryCount(prev => prev + 1);
        setWebViewKey(prev => prev + 1);
      }, 3000);
    } else {
      console.log('❌ Maximum retry count reached');
    }
  };

  // WebView 로드 시작 핸들러
  const handleWebViewLoadStart = () => {
    setLoading(true);
    setWebViewError(false);
  };

  // WebView 로드 성공 핸들러
  const handleWebViewLoadEnd = () => {
    setLoading(false);
    setWebViewError(false);
    setRetryCount(0);
    setAppIsReady(true);
    setIsWebViewReady(true);
    isReloadingRef.current = false; // reload 완료
  };

  // WebView Ready 상태 ref에 동기화 (AppState 타이밍 대응)
  useEffect(() => {
    webViewReadyRef.current = isWebViewReady;
  }, [isWebViewReady]);

  // 웹뷰에서 로그인 상태를 확인하는 JavaScript 코드
  const injectedJavaScript = `
    function checkLoginStatus() {
      // Next.js에서 설정한 로그인 상태 확인
      const userId = localStorage.getItem('userId');
      const isLoggedIn = !!userId;
      
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'LOGIN_STATUS',
        data: {
          isLoggedIn,
          userId
        }
      }));
    }

    // 초기 상태 확인
    checkLoginStatus();

    // localStorage 변경 감지
    window.addEventListener('storage', function(e) {
      if (e.key === 'userId') {
        checkLoginStatus();
      }
    });

    true;
  `;

  // Expo Updates 확인 및 적용 함수
  const checkForUpdates = async () => {
    if (isExpoGo || !Updates) {
      return;
    }

    try {
      console.log('🔍 Checking for updates...');
      const update = await Updates.checkForUpdateAsync();

      if (update.isAvailable) {
        console.log('📥 Update available, downloading...');
        await Updates.fetchUpdateAsync();
        console.log('✅ Update downloaded, reloading app...');
        await Updates.reloadAsync();
      } else {
        console.log('✅ App is up to date');
      }
    } catch (error) {
      console.error('❌ Error checking for updates:', error);
    }
  };

  // 웹뷰 메시지 핸들러
  const handleMessage = (event) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);

      if (message.type === 'LOGIN_STATUS') {
        if (message.data.isLoggedIn && message.data.userId) {
          setCurrentUserId(message.data.userId);
          if (expoPushToken) {
            registerPushToken(expoPushToken, message.data.userId);
          }
        } else {
          setCurrentUserId(null);
        }
      }
      if (message.type === 'OPEN_SETTINGS') {
        Linking.openSettings();
      }
      if (message.type === 'BLANK_DETECTED') {
        // blank 감지 시 reload (중복 방지 체크 포함)
        if (!isReloadingRef.current && webViewRef.current) {
          console.log('⚪️ Blank detected, reloading...');
          isReloadingRef.current = true;
          if (webViewRef.current.reload) {
            webViewRef.current.reload();
          } else {
            webViewRef.current.injectJavaScript('window.location.reload(); true;');
          }
        }
      }
    } catch (error) {
      console.error('Message parsing error:', error);
    }
  };

  // 스플래시 화면 처리: 최소 1초 유지
  useEffect(() => {
    const prepare = async () => {
      try {
        // 앱이 준비될 때까지 대기
        if (appIsReady) {
          // 최소 1초 대기 (스플래시 타임아웃)
          await new Promise(resolve => setTimeout(resolve, 1000));
          // 스플래시 화면 숨기기
          await SplashScreen.hideAsync();

          // 앱 시작 시 업데이트 확인
          console.log('🚀 App started, checking for updates...');
          checkForUpdates();


        }
      } catch (e) {
        console.warn('스플래시 화면 처리 중 오류:', e);
        await SplashScreen.hideAsync();
      }
    };

    prepare();
  }, [appIsReady]);



  // AppState 변경 감지 (백그라운드 복귀 처리)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      // 백그라운드로 이동
      if (appState.current === 'active' && nextAppState.match(/inactive|background/)) {
        console.log('App went to background');
        lastBackgroundTime.current = Date.now();
      }

      // 포그라운드 복귀 시
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        console.log('App returned to foreground');

        // 5분 이상 백그라운드에 있었으면 업데이트 확인
        if (lastBackgroundTime.current) {
          const timeInBackground = Date.now() - lastBackgroundTime.current;
          const fiveMinutes = 5 * 60 * 1000;

          if (timeInBackground > fiveMinutes) {
            console.log('⏰ App was in background for more than 5 minutes, checking for updates...');
            checkForUpdates();
          }
        }
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (Platform.OS === 'android') {
      // edgeToEdgeEnabled가 true일 때는 StatusBar.setBackgroundColor가 지원되지 않음
      // 대신 StatusBar 아래 View로 배경을 설정함
      StatusBar.setBarStyle('light-content');
      StatusBar.setTranslucent(true);
    }

    const backAction = () => {
      if (canGoBack) {
        webViewRef.current.goBack();
        return true;
      }
      return false;
    };

    const backHandler = BackHandler.addEventListener(
      'hardwareBackPress',
      backAction
    );

    return () => backHandler.remove();
  }, [canGoBack]);

  useEffect(() => {
    // Expo Go에서는 알림 기능을 사용하지 않음
    if (isExpoGo || !Notifications) {
      return;
    }

    registerForPushNotificationsAsync().then(token => {
      setExpoPushToken(token);
    });

    // 알림 수신 리스너
    notificationListener.current = Notifications.addNotificationReceivedListener(async notification => {
      const { data } = notification.request.content;

      // 현재 사용자와 수신자가 같은 경우에만 알림 표시
      if (data?.receiverId && data.receiverId === currentUserId) {
        const currentBadgeCount = await Notifications.getBadgeCountAsync();
        await Notifications.setBadgeCountAsync(currentBadgeCount + 1);
      }
    });

    // 알림 응답 리스너
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      const receiverId = response.notification.request.content.data.receiverId;

      if (receiverId === currentUserId) {
        const data = response.notification.request.content.data;

        if (data.url) {
          webViewRef.current?.injectJavaScript(`
            window.location.href = '${data.url}';
            true;
          `);
        }
      }
    });

    return () => {
      if (Notifications && notificationListener.current) {
        Notifications.removeNotificationSubscription(notificationListener.current);
      }
      if (Notifications && responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, [currentUserId]);

  // iOS WKWebView 프로세스 종료 감지
  const handleContentTerminated = () => {
    console.log('💥 WebView content process terminated');

    // 이미 reload 중이면 중복 실행 방지
    if (isReloadingRef.current) {
      console.log('⏸️ Already reloading, skipping duplicate reload from termination');
      return;
    }

    isReloadingRef.current = true;

    try {
      // 먼저 reload 시도
      if (webViewRef.current && webViewRef.current.reload) {
        webViewRef.current.reload();
      } else {
        // reload()가 없으면 재마운트
        console.log('⚠️ reload failed after termination, remounting');
        isReloadingRef.current = false;
        setIsWebViewReady(false);
        setLoading(true);
        setWebViewKey(prev => prev + 1);
      }
    } catch (e) {
      console.log('⚠️ reload failed after termination, remounting');
      isReloadingRef.current = false;
      setIsWebViewReady(false);
      setLoading(true);
      setWebViewKey(prev => prev + 1);
    }
  };

  // 주기적 blank 감지 (흰 화면 방어용)
  useEffect(() => {
    const interval = setInterval(() => {
      // reload 중일 때는 blank 감지 스킵 (reload 직후 일시적으로 blank일 수 있음)
      if (isReloadingRef.current) {
        console.log('⏸️ Skipping blank detection during reload');
        return;
      }

      if (webViewReadyRef.current && webViewRef.current) {
        webViewRef.current.injectJavaScript(`
          if (!document.body || document.body.innerHTML.trim().length === 0) {
            console.log("⚪️ Detected blank body, reloading...");
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'BLANK_DETECTED'
            }));
          }
          true;
        `);
      }
    }, 60000); // 1분마다 체크

    return () => clearInterval(interval);
  }, []);

  // 푸시 토큰 등록 함수
  const registerPushToken = async (token, uid) => {
    try {
      await fetch('https://stock.thinkingcatworks.com/api/push-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token,
          deviceType: Platform.OS,
          userId: uid
        }),
      });
    } catch (error) {
      console.error('Push token registration error:', error);
    }
  };

  async function registerForPushNotificationsAsync() {
    // Expo Go에서는 알림 기능을 사용하지 않음
    if (isExpoGo || !Notifications) {
      return null;
    }

    if (!Device.isDevice) {
      console.log('실제 기기에서만 푸시 알림을 받을 수 있습니다.');
      return null;
    }

    try {
      // Android 알림 채널 설정
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.DEFAULT,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF231F7C',
        });
      }

      // 권한 확인 및 요청
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.log('알림 권한이 거부되었습니다.');
        return null;
      }

      // Expo 푸시 토큰 획득
      const tokenData = await Notifications.getExpoPushTokenAsync();
      const token = tokenData.data;

      // currentUserId가 있을 때만 서버에 등록
      if (currentUserId) {
        await registerPushToken(token, currentUserId);
      }

      return token;
    } catch (error) {
      console.error("Push token error:", error);
      return null;
    }
  }

  // 안드로이드용 상단 패딩 계산
  const STATUSBAR_HEIGHT = Platform.OS === 'android' ? StatusBar.currentHeight || 0 : 0;

  return (
    <SafeAreaProvider style={{ backgroundColor: STATUS_BAR_COLOR }}>
      <View style={{
        flex: 1,
        backgroundColor: STATUS_BAR_COLOR,
        paddingTop: Platform.OS === 'android' ? STATUSBAR_HEIGHT : 0
      }}>
        <ExpoStatusBar
          style="light"
          backgroundColor={Platform.OS === 'android' ? undefined : STATUS_BAR_COLOR}
          translucent={true}
        />
        <SafeAreaView style={{
          flex: 0,
          backgroundColor: STATUS_BAR_COLOR
        }} />
        <SafeAreaView style={{
          flex: 1,
          backgroundColor: '#FFFFFF',
        }}>
          {/* 최초 로딩 시에만 커스텀 로딩 인디케이터 표시 (pull-to-refresh는 네이티브 스피너 사용) */}
          {!isWebViewReady && loading && !webViewError && (
            <ActivityIndicator
              style={styles.loadingIndicator}
              size="small"
            />
          )}
          {webViewError && retryCount >= 3 && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>페이지를 불러올 수 없습니다.</Text>
            </View>
          )}
          <WebView
            key={webViewKey}
            ref={webViewRef}
            source={{ uri: 'https://stock.thinkingcatworks.com/' }}
            style={{
              flex: 1,
              backgroundColor: '#FFFFFF'
            }}
            containerStyle={{ backgroundColor: '#FFFFFF' }}
            startInLoadingState={false}
            onLoadStart={handleWebViewLoadStart}
            onLoadEnd={handleWebViewLoadEnd}
            onError={handleWebViewError}
            onHttpError={handleWebViewError}
            onContentProcessDidTerminate={handleContentTerminated}
            allowsBackForwardNavigationGestures={true}
            onNavigationStateChange={(navState) => {
              setCanGoBack(navState.canGoBack);
            }}
            injectedJavaScript={injectedJavaScript}
            onMessage={handleMessage}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            useWebKit={true}               // WKWebView 사용
            originWhitelist={['*']}
            allowsInlineMediaPlayback={true}
            bounces={true}                 // iOS 관성 스크롤 허용
            scrollEnabled={true}
            nestedScrollEnabled={true}     // 내부 스크롤 허용
            pullToRefreshEnabled={true}   // Native pull-to-refresh 활성화
            cacheEnabled={true}            // 캐시 활성화
            cacheMode="LOAD_DEFAULT"       // 기본 캐시 모드
          />


        </SafeAreaView>
      </View>
    </SafeAreaProvider>
  );
};

export default App;

const styles = StyleSheet.create({
  loadingIndicator: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -12,
    marginTop: -12,
    zIndex: 1,
    transform: [{ scale: 0.6 }], // 더 작은 스피너
  },
  errorContainer: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -120,
    marginTop: -40,
    zIndex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    padding: 20,
    borderRadius: 10,
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  errorSubText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },

});

# App.js 비교 분석: 빠진 부분

## 새 로직에 있지만 현재 App.js에 없는 기능

### 1. ⚠️ **주기적 Blank 감지 (흰 화면 방어용)**

```javascript
// 새 로직에 있음
useEffect(() => {
  const interval = setInterval(() => {
    if (webViewReadyRef.current && webViewRef.current) {
      webViewRef.current.injectJavaScript(`
        if (!document.body || document.body.innerHTML.trim().length === 0) {
          console.log("⚪️ Detected blank body, reloading...");
          window.location.reload();
        }
        true;
      `);
    }
  }, 60000); // 1분마다 체크
  return () => clearInterval(interval);
}, []);
```

**현재 상태**: 없음  
**영향**: WebView가 blank 상태(흰 화면)가 되어도 감지하지 못함

---

### 2. 🔄 **webViewReadyRef를 통한 동기화**

```javascript
// 새 로직에 있음
const webViewReadyRef = useRef(false);

useEffect(() => {
  webViewReadyRef.current = isWebViewReady;
}, [isWebViewReady]);
```

**현재 상태**: `isWebViewReady` state만 사용  
**영향**: AppState 변경 시점에 state가 아직 업데이트되지 않아 타이밍 이슈 가능

---

### 3. ⏱️ **lastBackgroundTime을 state로 관리**

```javascript
// 새 로직: state 사용
const [lastBackgroundTime, setLastBackgroundTime] =
  (useState < number) | (null > null);

// 현재: ref 사용
const backgroundTime = useRef(null);
```

**현재 상태**: `useRef`로 관리  
**영향**: AppState useEffect의 dependency에 포함되어 더 정확한 타이밍 제어 가능

---

### 4. 🎯 **iOS/Android 명확한 구분 처리**

```javascript
// 새 로직
if (Platform.OS === "ios") {
  if (timeInBackground > 1000 * 60 * 30) {
    // 30분
    // 완전 재마운트
  } else {
    // reload 시도
  }
} else {
  // Android는 1분 이상이면 reload
  if (timeInBackground > 1000 * 60) {
    webViewRef.current?.reload();
  }
}
```

**현재 상태**: iOS/Android 구분 없이 30초 기준으로만 처리  
**영향**: Android에서도 불필요하게 재마운트할 수 있음

---

### 5. 🔧 **handleContentTerminated를 별도 함수로 분리**

```javascript
// 새 로직: 별도 함수
const handleContentTerminated = () => {
  console.log("💥 WebView content process terminated");
  try {
    webViewRef.current?.reload();
  } catch (e) {
    console.log("⚠️ reload failed after termination, remounting");
    setWebViewKey((prev) => prev + 1);
  }
};

// 현재: 인라인으로 처리
onContentProcessDidTerminate={() => {
  setIsWebViewReady(false);
  setLoading(true);
  setWebViewKey(prev => prev + 1);
}}
```

**현재 상태**: 인라인으로 처리, reload 시도 없이 바로 재마운트  
**영향**: reload로 해결 가능한 경우에도 불필요하게 재마운트

---

### 6. 📥 **onLoad와 onLoadEnd 분리**

```javascript
// 새 로직
onLoad={handleWebViewLoad}        // 로드 완료
onLoadEnd={() => setLoading(false)} // 추가 처리

// 현재
onLoadEnd={handleWebViewLoadEnd}   // 하나로 통합
```

**현재 상태**: `onLoadEnd`만 사용  
**영향**: 큰 차이 없지만, 로드 완료와 추가 처리를 분리하면 더 명확함

---

### 7. 🔄 **에러 재시도 로직 개선**

```javascript
// 새 로직
if (retryCount < 3) {
  setTimeout(() => {
    console.log("🔄 Retrying WebView load...");
    setRetryCount((prev) => prev + 1);
    setWebViewKey((prev) => prev + 1);
  }, 3000);
}

// 현재
// 에러 발생 시 재시도 로직이 없음 (handleWebViewError에만 처리)
```

**현재 상태**: 에러 핸들러에 재시도 로직이 명시적으로 없음  
**영향**: 에러 발생 시 자동 재시도가 없어 사용자가 수동으로 재시도해야 함

---

### 8. ⚙️ **WebView Props 차이**

```javascript
// 새 로직에 있음
cacheEnabled={false}                    // 캐시 비활성화
userAgent="CheckonApp/1.0 (ExpoWebView)" // User Agent 설정
setSupportMultipleWindows={false}        // 멀티 윈도우 비활성화
sharedCookiesEnabled                    // 쿠키 공유
incognito={false}                        // 시크릿 모드 아님
mediaPlaybackRequiresUserAction={false} // 자동 재생 허용

// 현재
cacheEnabled={true}                     // 캐시 활성화
cacheMode="LOAD_DEFAULT"                // 캐시 모드 설정
// userAgent 없음
// setSupportMultipleWindows 없음
// sharedCookiesEnabled 없음
// incognito 없음
// mediaPlaybackRequiresUserAction 없음
```

---

### 9. 🎨 **스플래시 스크린 처리 방식**

```javascript
// 새 로직: 더 명확한 타이밍 제어
useEffect(() => {
  async function prepare() {
    try {
      await new Promise((resolve) => setTimeout(resolve, 1500)); // 최소 표시 시간
      setAppIsReady(true);
    } catch (e) {
      console.warn(e);
    }
  }
  prepare();
}, []);

useEffect(() => {
  if (appIsReady) {
    const timer = setTimeout(async () => {
      await SplashScreen.hideAsync();
    }, 500);
    return () => clearTimeout(timer);
  }
}, [appIsReady]);

// 현재: appIsReady에 의존
useEffect(() => {
  const prepare = async () => {
    try {
      if (appIsReady) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await SplashScreen.hideAsync();
      }
    } catch (e) {
      console.warn("스플래시 화면 처리 중 오류:", e);
      await SplashScreen.hideAsync();
    }
  };
  prepare();
}, [appIsReady]);
```

**차이점**: 새 로직은 스플래시 표시와 숨김을 분리하여 더 명확하게 제어

---

### 10. 🚫 **에러 시 null 반환으로 렌더링 방지**

```javascript
// 새 로직
if (!appIsReady) return null;

// 현재
// appIsReady가 false여도 렌더링됨 (로딩 인디케이터만 표시)
```

---

## 현재 App.js에 있지만 새 로직에 없는 기능

1. **푸시 알림 기능** (expo-notifications)
2. **로그인 상태 확인** (injectedJavaScript, handleMessage)
3. **푸시 토큰 등록**
4. **안드로이드 백 버튼 처리** (BackHandler)
5. **StatusBar 설정**
6. **SafeAreaProvider, SafeAreaView 처리**
7. **onHttpError 핸들러**
8. **onNavigationStateChange** (뒤로가기 버튼 제어)
9. **OPEN_SETTINGS 메시지 처리**
10. **renderLoading prop**

---

## 권장 사항

### 높은 우선순위 (추가 권장)

1. ✅ **주기적 Blank 감지** - 흰 화면 문제 방지
2. ✅ **webViewReadyRef 동기화** - AppState 타이밍 이슈 해결
3. ✅ **handleContentTerminated 개선** - reload 시도 후 재마운트
4. ✅ **에러 재시도 로직** - 자동 재시도 기능

### 중간 우선순위

5. ✅ **iOS/Android 구분 처리** - 플랫폼별 최적화
6. ✅ **lastBackgroundTime을 state로 변경** - 더 정확한 타이밍 제어

### 낮은 우선순위

7. ⚠️ **WebView props 추가** - 필요에 따라 선택적 적용
8. ⚠️ **스플래시 스크린 처리 개선** - 현재도 작동하지만 더 명확하게

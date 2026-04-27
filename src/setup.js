/**
 * WebAPK Forge — Environment Setup Module
 * Handles Termux package installation and build tool verification
 */

const { execSync, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');
const http = require('http');

// ─── ANSI Colors ─────────────────────────────────────────────────────────────
const C = {
    reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
    red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
    cyan: '\x1b[36m',
};

function log(text, type = 'info') {
    const icons = { info: 'ℹ️ ', ok: '✓ ', err: '✗ ', warn: '⚠️ ', step: '▸ ' };
    const colors = { info: C.cyan, ok: C.green, err: C.red, warn: C.yellow, step: C.dim };
    console.log(`  ${colors[type]}${icons[type]}${C.reset} ${text}`);
}

// ─── Paths ───────────────────────────────────────────────────────────────────

function getToolsDir() {
    // tools/ next to this file, then fallback to package root
    const local = path.join(__dirname, '..', 'tools');
    if (fs.existsSync(local)) return local;
    return path.join(__dirname, 'tools');
}

function getProjectRoot() {
    return path.resolve(__dirname, '..');
}

// ─── Command helpers ─────────────────────────────────────────────────────────

function run(cmd, opts = {}) {
    try {
        const result = spawnSync(cmd, {
            shell: true,
            encoding: 'utf-8',
            timeout: opts.timeout || 300000,
            stdio: ['pipe', 'pipe', 'pipe'],
            ...opts,
        });
        return { ok: result.status === 0, stdout: (result.stdout || '').trim(), stderr: (result.stderr || '').trim(), code: result.status };
    } catch (e) {
        return { ok: false, stdout: '', stderr: e.message, code: -1 };
    }
}

function cmdExists(cmd) {
    return run(`command -v ${cmd}`).ok;
}

function isTermux() {
    return process.env.TERMUX_VERSION || process.env.PREFIX?.includes('com.termux') || fs.existsSync('/data/data/com.termux');
}

function getTermuxPrefix() {
    return process.env.PREFIX || '/data/data/com.termux/files/usr';
}

// ─── Download helper ─────────────────────────────────────────────────────────

function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const dir = path.dirname(dest);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        const file = fs.createWriteStream(dest);
        let downloaded = 0;

        function followRedirect(currentUrl) {
            const mod = currentUrl.startsWith('https') ? https : http;
            mod.get(currentUrl, (res) => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    followRedirect(res.headers.location);
                    return;
                }
                if (res.statusCode !== 200) {
                    reject(new Error(`HTTP ${res.statusCode} for ${url}`));
                    return;
                }
                const total = parseInt(res.headers['content-length'], 10) || 0;
                res.on('data', (chunk) => {
                    downloaded += chunk.length;
                    if (total > 0) {
                        const pct = Math.round((downloaded / total) * 100);
                        process.stdout.write(`\r  ▸ Скачивание... ${pct}% (${(downloaded / 1048576).toFixed(1)} MB / ${(total / 1048576).toFixed(1)} MB)`);
                    }
                });
                res.pipe(file);
                file.on('finish', () => {
                    file.close();
                    if (total > 0) process.stdout.write('\r');
                    resolve();
                });
            }).on('error', reject);
        }

        followRedirect(url);
    });
}

// ─── Check environment ───────────────────────────────────────────────────────

async function checkEnvironment() {
    const toolsDir = getToolsDir();
    const issues = [];

    // Check Termux
    if (!isTermux()) {
        log('Не Termux окружение — сборка может не работать', 'warn');
    }

    // Check pkg
    if (!cmdExists('pkg') && !cmdExists('apt')) {
        issues.push('pkg/apt не найден — установите Termux');
    }

    // Check Java
    if (!cmdExists('javac')) {
        issues.push('javac не найден — выполните: pkg install openjdk-17');
    } else {
        const javaVer = run('javac -version');
        log(`Java: ${javaVer.stdout}`, 'ok');
    }

    // Check aapt2
    const aapt2Path = path.join(getTermuxPrefix(), 'bin', 'aapt2');
    const aapt2Ok = cmdExists('aapt2') || fs.existsSync(aapt2Path);
    if (!aapt2Ok) {
        issues.push('aapt2 не найден — выполните: pkg install aapt2');
    } else {
        log('aapt2: найден', 'ok');
    }

    // Check d8 (r8.jar)
    const r8Path = path.join(toolsDir, 'r8.jar');
    if (!fs.existsSync(r8Path)) {
        issues.push('r8.jar (d8) не найден — выполните: webapk-setup');
    } else {
        log(`r8.jar (d8): найден (${(fs.statSync(r8Path).size / 1048576).toFixed(1)} MB)`, 'ok');
    }

    // Check android.jar stub
    const androidJar = path.join(toolsDir, 'android.jar');
    if (!fs.existsSync(androidJar)) {
        issues.push('android.jar не найден — будет создан автоматически');
    } else {
        log(`android.jar: найден (${(fs.statSync(androidJar).size / 1024).toFixed(0)} KB)`, 'ok');
    }

    // Check keystore
    const keystorePath = path.join(toolsDir, 'debug.keystore');
    if (!fs.existsSync(keystorePath)) {
        issues.push('debug.keystore не найден — будет создан автоматически');
    } else {
        log('debug.keystore: найден', 'ok');
    }

    if (issues.length > 0) {
        log(`Найдено проблем: ${issues.length}`, 'warn');
        issues.forEach(i => log(i, 'warn'));
        return false;
    }

    log('Окружение готово к сборке!', 'ok');
    return true;
}

// ─── Setup environment ───────────────────────────────────────────────────────

async function setupEnvironment() {
    const toolsDir = getToolsDir();
    if (!fs.existsSync(toolsDir)) fs.mkdirSync(toolsDir, { recursive: true });

    console.log('');
    log('Начинаю настройку окружения...', 'step');
    console.log('');

    // ── Step 1: Termux packages ──────────────────────────────────────────
    log('Установка Termux пакетов...', 'step');

    const termuxPkgs = ['openjdk-17', 'aapt2', 'wget', 'unzip', 'zip'];

    for (const pkg of termuxPkgs) {
        const check = cmdExists(pkg === 'openjdk-17' ? 'javac' : pkg);
        if (check) {
            log(`${pkg}: уже установлен`, 'ok');
        } else {
            log(`Установка ${pkg}...`, 'step');
            const result = run(`pkg install -y ${pkg}`);
            if (result.ok) {
                log(`${pkg}: установлен`, 'ok');
            } else {
                log(`Не удалось установить ${pkg}: ${result.stderr}`, 'err');
                log(`Попробуйте вручную: pkg install -y ${pkg}`, 'warn');
            }
        }
    }

    // ── Step 2: Download r8.jar (contains d8) ────────────────────────────
    const r8Path = path.join(toolsDir, 'r8.jar');
    if (fs.existsSync(r8Path)) {
        log(`r8.jar: уже скачан (${(fs.statSync(r8Path).size / 1048576).toFixed(1)} MB)`, 'ok');
    } else {
        log('Скачивание r8.jar (d8 compiler)...', 'step');
        try {
            const R8_URL = 'https://github.com/nicholasgasior/gmern/raw/refs/heads/master/files/r8.jar';
            const R8_FALLBACK = 'https://repo1.maven.org/maven2/com/android/tools/r8/8.2.47/r8-8.2.47.jar';

            try {
                await downloadFile(R8_URL, r8Path);
            } catch {
                await downloadFile(R8_FALLBACK, r8Path);
            }
            log(`r8.jar: скачан (${(fs.statSync(r8Path).size / 1048576).toFixed(1)} MB)`, 'ok');
        } catch (e) {
            log(`Не удалось скачать r8.jar: ${e.message}`, 'err');
            log('Скачайте вручную и положите в: ' + r8Path, 'warn');
        }
    }

    // ── Step 3: Generate android.jar stub ────────────────────────────────
    const androidJar = path.join(toolsDir, 'android.jar');
    if (fs.existsSync(androidJar)) {
        log(`android.jar: уже существует (${(fs.statSync(androidJar).size / 1024).toFixed(0)} KB)`, 'ok');
    } else {
        log('Генерация android.jar stub...', 'step');
        const generated = generateAndroidStub(toolsDir);
        if (generated) {
            log(`android.jar: создан (${(fs.statSync(androidJar).size / 1024).toFixed(0)} KB)`, 'ok');
        } else {
            log('Не удалось создать android.jar', 'err');
        }
    }

    // ── Step 4: Generate debug keystore ──────────────────────────────────
    const keystorePath = path.join(toolsDir, 'debug.keystore');
    if (fs.existsSync(keystorePath)) {
        log('debug.keystore: уже существует', 'ok');
    } else {
        log('Генерация debug.keystore для подписи APK...', 'step');
        const ksResult = run(`keytool -genkeypair -v -keystore "${keystorePath}" -alias androiddebugkey -keyalg RSA -keysize 2048 -validity 10000 -storepass android -keypass android -dname "CN=WebAPK Forge, OU=Dev, O=WebAPK, L=Unknown, ST=Unknown, C=RU"`, {
            timeout: 30000,
        });
        if (ksResult.ok) {
            log('debug.keystore: создан', 'ok');
        } else {
            log(`keytool не доступен: ${ksResult.stderr}`, 'err');
        }
    }

    console.log('');
    log('Настройка завершена!', 'ok');
    console.log('');
    log('Теперь можно собрать APK — выберите [1] в меню.', 'info');
    console.log('');
}

// ─── Generate minimal android.jar stub ───────────────────────────────────────

function generateAndroidStub(toolsDir) {
    const tmpDir = path.join(os.tmpdir(), 'android-stub-' + Date.now());
    const stubDir = path.join(tmpDir, 'src');
    const classesDir = path.join(tmpDir, 'classes');

    try {
        fs.mkdirSync(stubDir, { recursive: true });
        fs.mkdirSync(classesDir, { recursive: true });

        // Minimal stubs needed for WebView APK compilation
        const stubs = {
            'android/app/Activity.java': `
package android.app;
public class Activity {
    protected void onCreate(android.os.Bundle savedInstanceState) {}
    protected void onStart() {}
    protected void onResume() {}
    protected void onPause() {}
    protected void onStop() {}
    protected void onDestroy() {}
    public void setContentView(android.view.View view) {}
    public void setContentView(int layoutResID) {}
    public boolean requestWindowFeature(int featureId) { return true; }
    public android.view.Window getWindow() { return null; }
    public void onBackPressed() {}
    public void finish() {}
    public android.content.Intent getIntent() { return null; }
    public final void setResult(int resultCode) {}
    public <T extends android.view.View> T findViewById(int id) { return null; }
    public android.content.res.Resources getResources() { return null; }
    public android.content.res.Resources.Theme getTheme() { return null; }
    public Object getSystemService(String name) { return null; }
    public android.content.SharedPreferences getSharedPreferences(String name, int mode) { return null; }
    public android.content.SharedPreferences getPreferences(int mode) { return null; }
    public final void runOnUiThread(Runnable action) { if (action != null) action.run(); }
    public android.content.pm.PackageManager getPackageManager() { return null; }
    public android.os.Bundle getExtras() { return null; }
    public void startActivityForResult(android.content.Intent intent, int requestCode) {}
    public void setResult(int resultCode, android.content.Intent data) {}
    public void overridePendingTransition(int enterAnim, int exitAnim) {}
    public boolean isFinishing() { return false; }
    public boolean isDestroyed() { return false; }
    public final void setResult(int resultCode, String data) {}
    public android.view.LayoutInflater getLayoutInflater() { return null; }
    public android.view.MenuInflater getMenuInflater() { return null; }
    public void invalidateOptionsMenu() {}
    public void onConfigurationChanged(android.content.res.Configuration newConfig) {}
    public android.content.res.Configuration getConfiguration() { return null; }
    public void onLowMemory() {}
    public void onTrimMemory(int level) {}
}
`,
            'android/app/Application.java': `
package android.app;
public class Application extends android.content.ContextWrapper {
    public void onCreate() {}
    public void onTerminate() {}
    public void onLowMemory() {}
    public void onTrimMemory(int level) {}
    public void onConfigurationChanged(android.content.res.Configuration newConfig) {}
}
`,
            'android/content/Context.java': `
package android.content;
import android.content.res.Resources;
import android.content.res.Configuration;
public class Context {
    public Resources getResources() { return null; }
    public SharedPreferences getSharedPreferences(String name, int mode) { return null; }
    public Object getSystemService(String name) { return null; }
    public String getPackageName() { return ""; }
    public String getPackageName2() { return ""; }
    public ContentResolver getContentResolver() { return null; }
    public ApplicationInfo getApplicationInfo() { return null; }
    public File getFilesDir() { return null; }
    public File getCacheDir() { return null; }
    public File getExternalFilesDir(String type) { return null; }
    public File getExternalCacheDir() { return null; }
    public ClassLoader getClassLoader() { return null; }
    public void startActivity(Intent intent) {}
    public void startActivityForResult(Intent intent, int requestCode) {}
    public void sendBroadcast(Intent intent) {}
    public boolean bindService(Intent service, ServiceConnection conn, int flags) { return false; }
    public void unbindService(ServiceConnection conn) {}
    public void registerReceiver(BroadcastReceiver receiver, IntentFilter filter) {}
    public void unregisterReceiver(BroadcastReceiver receiver) {}
    public void startService(Intent service) {}
    public boolean stopService(Intent service) { return false; }
    public static final int MODE_PRIVATE = 0;
    public static final int MODE_WORLD_READABLE = 1;
    public static final int MODE_WORLD_WRITEABLE = 2;
    public static final int MODE_APPEND = 32768;
    public static final int BIND_AUTO_CREATE = 1;
}
interface ServiceConnection {}
class BroadcastReceiver {}
class IntentFilter {}
class ContentResolver {}
class ApplicationInfo {}
`,
            'android/content/ContextWrapper.java': `
package android.content;
public class ContextWrapper extends Context {
    protected void attachBaseContext(Context base) {}
    public Context getBaseContext() { return null; }
}
`,
            'android/content/Intent.java': `
package android.content;
public class Intent {
    public Intent() {}
    public Intent(String action) {}
    public Intent(String action, android.net.Uri uri) {}
    public Intent setAction(String action) { return this; }
    public Intent setData(android.net.Uri data) { return this; }
    public Intent setType(String type) { return this; }
    public Intent addCategory(String category) { return this; }
    public Intent setFlags(int flags) { return this; }
    public Intent putExtra(String name, String value) { return this; }
    public Intent putExtra(String name, int value) { return this; }
    public Intent putExtra(String name, boolean value) { return this; }
    public Intent putExtra(String name, long value) { return this; }
    public String getAction() { return null; }
    public String getStringExtra(String name) { return null; }
    public int getIntExtra(String name, int defaultValue) { return defaultValue; }
    public boolean getBooleanExtra(String name, boolean defaultValue) { return defaultValue; }
    public android.net.Uri getData() { return null; }
    public String getType() { return null; }
    public String[] getStringArrayExtra(String name) { return null; }
    public android.os.Bundle getExtras() { return null; }
    public static final int FLAG_ACTIVITY_NEW_TASK = 0x10000000;
    public static final int FLAG_ACTIVITY_CLEAR_TOP = 0x04000000;
    public static final int FLAG_ACTIVITY_SINGLE_TOP = 0x20000000;
    public static String ACTION_MAIN = "android.intent.action.MAIN";
    public static String ACTION_VIEW = "android.intent.action.VIEW";
}
`,
            'android/content/SharedPreferences.java': `
package android.content;
public interface SharedPreferences {
    String getString(String key, String defValue);
    int getInt(String key, int defValue);
    boolean getBoolean(String key, boolean defValue);
    Editor edit();
    interface Editor {
        Editor putString(String key, String value);
        Editor putInt(String key, int value);
        Editor putBoolean(String key, boolean value);
        Editor remove(String key);
        Editor clear();
        boolean commit();
        void apply();
    }
}
`,
            'android/content/res/Resources.java': `
package android.content.res;
public class Resources {
    public String getString(int id) { return ""; }
    public String getString(int id, Object... formatArgs) { return ""; }
    public int getInteger(int id) { return 0; }
    public Configuration getConfiguration() { return null; }
    public DisplayMetrics getDisplayMetrics() { return null; }
    public TypedArray obtainTypedArray(int id) { return null; }
    public InputStream openRawResource(int id) { return null; }
    public static class Theme {
        public void applyStyle(int resid, boolean force) {}
        public void setTo(Resources.Theme other) {}
        public int obtainStyledAttributes(int[] attrs) { return 0; }
        public int obtainStyledAttributes(int resid, int[] attrs) { return 0; }
        public void resolveAttribute(int attr, TypedValue outValue, boolean resolveRefs) {}
    }
}
class Configuration {}
class DisplayMetrics {
    public int widthPixels;
    public int heightPixels;
    public float density;
    public int densityDpi;
    public float scaledDensity;
    public float xdpi;
    public float ydpi;
}
class TypedArray {
    public String getString(int index) { return null; }
    public int getInt(int index, int defValue) { return defValue; }
    public boolean getBoolean(int index, boolean defValue) { return defValue; }
    public int getResourceId(int index, int defValue) { return defValue; }
    public void recycle() {}
}
class TypedValue {
    public int type;
    public int data;
    public String string;
    public int resourceId;
    public static final int TYPE_NULL = 0;
    public static final int TYPE_STRING = 3;
    public static final int TYPE_FIRST_INT = 16;
    public static final int TYPE_INT_DEC = 17;
    public static final int TYPE_INT_HEX = 18;
    public static final int TYPE_INT_BOOLEAN = 19;
}
`,
            'android/content/res/AssetManager.java': `
package android.content.res;
import java.io.InputStream;
import java.io.IOException;
public class AssetManager {
    public InputStream open(String fileName) throws IOException { return null; }
    public String[] list(String path) throws IOException { return new String[0]; }
    public void close() {}
}
`,
            'android/net/Uri.java': `
package android.net;
public class Uri {
    public static Uri parse(String uriString) { return null; }
    public static Uri fromFile(java.io.File file) { return null; }
    public String toString() { return ""; }
    public String getScheme() { return null; }
    public String getHost() { return null; }
    public String getPath() { return null; }
    public String getQuery() { return null; }
    public String getFragment() { return null; }
    public static final class Builder {
        public Builder scheme(String scheme) { return this; }
        public Builder authority(String authority) { return this; }
        public Builder path(String path) { return this; }
        public Builder query(String query) { return this; }
        public Builder fragment(String fragment) { return this; }
        public Uri build() { return null; }
    }
}
`,
            'android/os/Bundle.java': `
package android.os;
public class Bundle {
    public Bundle() {}
    public void putString(String key, String value) {}
    public void putInt(String key, int value) {}
    public void putBoolean(String key, boolean value) {}
    public void putLong(String key, long value) {}
    public void putParcelable(String key, Parcelable value) {}
    public String getString(String key) { return null; }
    public String getString(String key, String defaultValue) { return defaultValue; }
    public int getInt(String key) { return 0; }
    public int getInt(String key, int defaultValue) { return defaultValue; }
    public boolean getBoolean(String key) { return false; }
    public boolean getBoolean(String key, boolean defaultValue) { return defaultValue; }
    public long getLong(String key) { return 0; }
    public Parcelable getParcelable(String key) { return null; }
    public String[] getStringArray(String key) { return null; }
    public boolean containsKey(String key) { return false; }
    public void clear() {}
}
`,
            'android/os/Parcelable.java': `
package android.os;
public interface Parcelable {
    int describeContents();
    void writeToParcel(Parcel dest, int flags);
    public static final int PARCELABLE_WRITE_RETURN_VALUE = 1;
}
interface Creator<T> {
    T createFromParcel(Parcel source);
    T[] newArray(int size);
}
class Parcel {
    public void writeInt(int val) {}
    public void writeString(String val) {}
    public void writeParcelable(Parcelable p, int flags) {}
    public void writeLong(long val) {}
    public void writeBoolean(boolean val) {}
    public void writeFloat(float val) {}
    public void writeByteArray(byte[] b) {}
    public int readInt() { return 0; }
    public String readString() { return null; }
    public long readLong() { return 0; }
    public boolean readBoolean() { return false; }
    public float readFloat() { return 0; }
    public byte[] createByteArray() { return null; }
    public Parcelable readParcelable(ClassLoader loader) { return null; }
}
`,
            'android/os/Build.java': `
package android.os;
public class Build {
    public static final String MANUFACTURER = "unknown";
    public static final String MODEL = "unknown";
    public static final String BRAND = "unknown";
    public static final String PRODUCT = "unknown";
    public static final String DEVICE = "unknown";
    public static final String HARDWARE = "unknown";
    public static final String FINGERPRINT = "unknown";
    public static final String DISPLAY = "unknown";
    public static final String HOST = "unknown";
    public static final String TYPE = "user";
    public static final String TAGS = "";
    public static final long TIME = 0;
    public static final int VERSION_CODES_BASE = 1;
    public static final int VERSION_CODES_CUR_DEVELOPMENT = 10000;
    public static class VERSION {
        public static final String SDK = "21";
        public static final int SDK_INT = 21;
        public static final String RELEASE = "5.0";
        public static final String INCREMENTAL = "";
        public static final String CODENAME = "REL";
    }
}
`,
            'android/view/View.java': `
package android.view;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Rect;
import android.util.AttributeSet;
public class View {
    public View() {}
    public View(Context context) {}
    public View(Context context, AttributeSet attrs) {}
    public View(Context context, AttributeSet attrs, int defStyleAttr) {}
    public void setOnClickListener(OnClickListener l) {}
    public void setOnLongClickListener(OnLongClickListener l) {}
    public void setOnTouchListener(OnTouchListener l) {}
    public boolean post(Runnable action) { return false; }
    public boolean postDelayed(Runnable action, long delayMillis) { return false; }
    public void removeCallbacks(Runnable action) {}
    public void invalidate() {}
    public void requestLayout() {}
    public void setVisibility(int visibility) {}
    public int getVisibility() { return 0; }
    public void setAlpha(float alpha) {}
    public float getAlpha() { return 1.0f; }
    public void setTranslationX(float translationX) {}
    public void setTranslationY(float translationY) {}
    public float getX() { return 0; }
    public float getY() { return 0; }
    public int getWidth() { return 0; }
    public int getHeight() { return 0; }
    public int getId() { return 0; }
    public void setId(int id) {}
    public Object getTag() { return null; }
    public void setTag(Object tag) {}
    public void setTag(int key, Object tag) {}
    public void bringToFront() {}
    public boolean callOnClick() { return false; }
    public boolean performClick() { return false; }
    public void setFocusable(boolean focusable) {}
    public void setEnabled(boolean enabled) {}
    public boolean isEnabled() { return true; }
    public boolean isSelected() { return false; }
    public void setSelected(boolean selected) {}
    public void setPressed(boolean pressed) {}
    public boolean isPressed() { return false; }
    public void scrollTo(int x, int y) {}
    public void scrollBy(int x, int y) {}
    public void setBackgroundColor(int color) {}
    public void setBackgroundResource(int resid) {}
    public void setBackground(Drawable background) {}
    public Drawable getBackground() { return null; }
    public Context getContext() { return null; }
    public void setOnKeyListener(OnKeyListener l) {}
    public void setOnFocusChangeListener(OnFocusChangeListener l) {}
    public void requestFocus() {}
    public boolean isFocused() { return false; }
    public Rect getGlobalVisibleRect(Rect r) { return false; }
    public void getLocationOnScreen(int[] location) {}
    public void getLocationInWindow(int[] location) {}
    public boolean hasFocus() { return false; }
    public void onDraw(Canvas canvas) {}
    public boolean onTouchEvent(MotionEvent event) { return false; }
    public boolean onKeyEvent(KeyEvent event) { return false; }
    public static final int VISIBLE = 0;
    public static final int INVISIBLE = 4;
    public static final int GONE = 8;
    public static final int NO_ID = -1;
}
interface OnClickListener { void onClick(View v); }
interface OnLongClickListener { boolean onLongClick(View v); }
interface OnTouchListener { boolean onTouch(View v, MotionEvent event); }
interface OnKeyListener { boolean onKey(View v, int keyCode, KeyEvent event); }
interface OnFocusChangeListener { void onFocusChange(View v, boolean hasFocus); }
`,
            'android/view/ViewGroup.java': `
package android.view;
import android.content.Context;
import android.util.AttributeSet;
public class ViewGroup extends View {
    public ViewGroup(Context context) {}
    public ViewGroup(Context context, AttributeSet attrs) {}
    public void addView(View child) {}
    public void addView(View child, int index) {}
    public void addView(View child, int width, int height) {}
    public void addView(View child, android.view.ViewGroup.LayoutParams params) {}
    public void removeView(View view) {}
    public void removeViewAt(int index) {}
    public int getChildCount() { return 0; }
    public View getChildAt(int index) { return null; }
    public void removeAllViews() {}
    public static class LayoutParams {
        public int width;
        public int height;
        public LayoutParams(int width, int height) {}
    }
    public static class MarginLayoutParams extends LayoutParams {
        public int leftMargin, topMargin, rightMargin, bottomMargin;
        public MarginLayoutParams(int width, int height) { super(width, height); }
    }
}
`,
            'android/view/Window.java': `
package android.view;
public class Window {
    public void setFlags(int flags, int mask) {}
    public void addFlags(int flags) {}
    public void clearFlags(int flags) {}
    public void setFeatureInt(int featureId, int value) {}
    public void setSoftInputMode(int mode) {}
    public View getDecorView() { return null; }
    public View getCurrentFocus() { return null; }
    public void setContentView(View view) {}
    public void setContentView(int layoutResID) {}
    public void setTitleColor(int textColor) {}
    public void setNavigationBarColor(int color) {}
    public void setStatusBarColor(int color) {}
    public boolean hasFeature(int feature) { return false; }
    public static final int FLAG_FULLSCREEN = 0x00000400;
    public static final int FLAG_LAYOUT_NO_LIMITS = 0x00000200;
    public static final int FLAG_TRANSLUCENT_STATUS = 0x04000000;
    public static final int FLAG_TRANSLUCENT_NAVIGATION = 0x08000000;
    public static final int FEATURE_NO_TITLE = 1;
    public static final int FEATURE_ACTION_BAR = 8;
    public static final int FEATURE_OPTIONS_PANEL = 0;
    public static final int FEATURE_INDETERMINATE_PROGRESS = 5;
    public static final int PROGRESS_VISIBILITY_ON = -1;
    public static final int PROGRESS_VISIBILITY_OFF = -2;
    public static final int PROGRESS_INDETERMINATE_ON = -3;
    public static final int PROGRESS_INDETERMINATE_OFF = -4;
    public static final int ID_ANDROID_CONTENT = 16908290;
}
`,
            'android/view/WindowManager.java': `
package android.view;
public interface WindowManager extends android.view.ViewManager {
    public interface LayoutParams extends android.view.ViewGroup.LayoutParams {
        public static final int FLAG_ALLOW_LOCK_WHILE_SCREEN_ON = 0x00000001;
        public static final int FLAG_DIM_BEHIND = 0x00000002;
        public static final int FLAG_BLUR_BEHIND = 0x00000004;
        public static final int FLAG_NOT_FOCUSABLE = 0x00000008;
        public static final int FLAG_NOT_TOUCHABLE = 0x00000010;
        public static final int FLAG_NOT_TOUCH_MODAL = 0x00000020;
        public static final int FLAG_TOUCHABLE_WHEN_WAKING = 0x00000040;
        public static final int FLAG_KEEP_SCREEN_ON = 0x00000080;
        public static final int FLAG_LAYOUT_IN_SCREEN = 0x00000100;
        public static final int FLAG_LAYOUT_NO_LIMITS = 0x00000200;
        public static final int FLAG_FULLSCREEN = 0x00000400;
        public static final int FLAG_FORCE_NOT_FULLSCREEN = 0x00000800;
        public static final int FLAG_SHOW_WHEN_LOCKED = 0x00080000;
        public static final int FLAG_TURN_SCREEN_ON = 0x00200000;
        public int type;
        public int gravity;
        public float horizontalMargin;
        public float verticalMargin;
        public int x;
        public int y;
        public int windowAnimations;
    }
}
interface ViewManager {
    void addView(View view, ViewGroup.LayoutParams params);
    void updateViewLayout(View view, ViewGroup.LayoutParams params);
    void removeView(View view);
}
`,
            'android/view/KeyEvent.java': `
package android.view;
public class KeyEvent {
    public static final int KEYCODE_BACK = 4;
    public static final int KEYCODE_HOME = 3;
    public static final int KEYCODE_MENU = 82;
    public static final int KEYCODE_VOLUME_UP = 24;
    public static final int KEYCODE_VOLUME_DOWN = 25;
    public static final int KEYCODE_POWER = 26;
    public static final int KEYCODE_ENTER = 66;
    public static final int ACTION_DOWN = 0;
    public static final int ACTION_UP = 1;
    public static final int ACTION_MULTIPLE = 2;
    public int getKeyCode() { return 0; }
    public int getAction() { return 0; }
    public int getRepeatCount() { return 0; }
    public long getEventTime() { return 0; }
    public long getDownTime() { return 0; }
}
`,
            'android/view/MotionEvent.java': `
package android.view;
public class MotionEvent {
    public static final int ACTION_DOWN = 0;
    public static final int ACTION_UP = 1;
    public static final int ACTION_MOVE = 2;
    public static final int ACTION_CANCEL = 3;
    public static final int ACTION_POINTER_DOWN = 5;
    public static final int ACTION_POINTER_UP = 6;
    public float getX() { return 0; }
    public float getY() { return 0; }
    public int getAction() { return 0; }
    public int getPointerCount() { return 1; }
    public float getX(int pointerIndex) { return 0; }
    public float getY(int pointerIndex) { return 0; }
    public long getEventTime() { return 0; }
    public long getDownTime() { return 0; }
}
`,
            'android/view/Menu.java': `
package android.view;
public interface Menu {
    MenuItem add(int groupId, int itemId, int order, CharSequence title);
    MenuItem add(CharSequence title);
    MenuItem add(int titleRes);
    int size();
    MenuItem getItem(int index);
    void clear();
    boolean hasVisibleItems();
    interface Item {}
}
`,
            'android/view/MenuItem.java': `
package android.view;
public interface MenuItem {
    MenuItem setTitle(CharSequence title);
    CharSequence getTitle();
    MenuItem setIcon(int iconRes);
    MenuItem setIcon(Drawable icon);
    MenuItem setEnabled(boolean enabled);
    boolean isEnabled();
    MenuItem setVisible(boolean visible);
    boolean isVisible();
    MenuItem setShowAsAction(int actionEnum);
    int getItemId();
    MenuItem setOnMenuItemClickListener(OnMenuItemClickListener menuItemClickListener);
    interface OnMenuItemClickListener { boolean onMenuItemClick(MenuItem item); }
    public static final int SHOW_AS_ACTION_NEVER = 0;
    public static final int SHOW_AS_ACTION_IF_ROOM = 1;
    public static final int SHOW_AS_ACTION_ALWAYS = 2;
    public static final int SHOW_AS_ACTION_WITH_TEXT = 4;
}
`,
            'android/view/MenuInflater.java': `
package android.view;
public class MenuInflater {
    public void inflate(int menuRes, Menu menu) {}
}
`,
            'android/view/LayoutInflater.java': `
package android.view;
public class LayoutInflater {
    public View inflate(int resource, android.view.ViewGroup root) { return null; }
    public View inflate(int resource, android.view.ViewGroup root, boolean attachToRoot) { return null; }
    public static LayoutInflater from(android.content.Context context) { return null; }
}
`,
            'android/view/accessibility/AccessibilityEvent.java': `
package android.view.accessibility;
public class AccessibilityEvent {
    public static final int TYPE_VIEW_CLICKED = 1;
    public static final int TYPE_VIEW_FOCUSED = 8;
    public static final int TYPE_WINDOW_STATE_CHANGED = 32;
}
`,
            'android/view/ContextThemeWrapper.java': `
package android.view;
import android.content.Context;
import android.content.res.Configuration;
public class ContextThemeWrapper extends android.content.ContextWrapper {
    public ContextThemeWrapper() {}
    public ContextThemeWrapper(Context base, int themeresid) {}
    public void setTheme(int resid) {}
    public int getThemeResId() { return 0; }
}
`,
            'android/graphics/Canvas.java': `
package android.graphics;
public class Canvas {
    public void drawColor(int color) {}
    public void drawRect(float left, float top, float right, float bottom, Paint paint) {}
    public void drawText(String text, float x, float y, Paint paint) {}
    public int getWidth() { return 0; }
    public int getHeight() { return 0; }
    public void save() {}
    public void restore() {}
    public void translate(float dx, float dy) {}
    public void scale(float sx, float sy) {}
    public void rotate(float degrees) {}
}
`,
            'android/graphics/Paint.java': `
package android.graphics;
public class Paint {
    public Paint() {}
    public void setColor(int color) {}
    public void setTextSize(float textSize) {}
    public void setStyle(Style style) {}
    public void setStrokeWidth(float width) {}
    public void setAntiAlias(boolean aa) {}
    public static enum Style { FILL, STROKE, FILL_AND_STROKE }
}
`,
            'android/graphics/Bitmap.java': `
package android.graphics;
public class Bitmap {
    public int getWidth() { return 0; }
    public int getHeight() { return 0; }
    public void recycle() {}
    public static Bitmap createBitmap(int width, int height, Config config) { return null; }
    public static Config valueOf(String name) { return Config.ARGB_8888; }
    public static enum Config { ALPHA_8, RGB_565, ARGB_4444, ARGB_8888 }
}
`,
            'android/graphics/Color.java': `
package android.graphics;
public class Color {
    public static int parseColor(String colorString) { return 0; }
    public static int argb(int alpha, int red, int green, int blue) { return 0; }
    public static int rgb(int red, int green, int blue) { return 0; }
    public static final int BLACK = 0xFF000000;
    public static final int WHITE = 0xFFFFFFFF;
    public static final int TRANSPARENT = 0;
}
`,
            'android/graphics/drawable/Drawable.java': `
package android.graphics.drawable;
import android.graphics.Canvas;
import android.graphics.ColorFilter;
import android.graphics.Rect;
public class Drawable {
    public void draw(Canvas canvas) {}
    public void setBounds(int left, int top, int right, int bottom) {}
    public void setBounds(Rect bounds) {}
    public void setAlpha(int alpha) {}
    public void setColorFilter(ColorFilter cf) {}
    public int getIntrinsicWidth() { return -1; }
    public int getIntrinsicHeight() { return -1; }
    public int getMinimumWidth() { return 0; }
    public int getMinimumHeight() { return 0; }
    public boolean isVisible() { return true; }
    public void setVisible(boolean visible, boolean restart) {}
}
`,
            'android/util/AttributeSet.java': `
package android.util;
public interface AttributeSet {
    int getAttributeCount();
    String getAttributeName(int index);
    String getAttributeValue(int index);
    String getAttributeValue(String namespace, String name);
    String getPositionDescription();
    int getAttributeNameResource(int index);
    int getAttributeListValue(String namespace, String attribute, String[] options, int defaultValue);
    int getAttributeUnsignedIntValue(String namespace, String attribute, int defaultValue);
    int getAttributeIntValue(String namespace, String attribute, int defaultValue);
    int getAttributeResourceValue(String namespace, String attribute, int defaultValue);
    boolean getAttributeBooleanValue(String namespace, String attribute, boolean defaultValue);
}
`,
            'android/util/Log.java': `
package android.util;
public class Log {
    public static int v(String tag, String msg) { return 0; }
    public static int d(String tag, String msg) { return 0; }
    public static int i(String tag, String msg) { return 0; }
    public static int w(String tag, String msg) { return 0; }
    public static int w(String tag, String msg, Throwable tr) { return 0; }
    public static int e(String tag, String msg) { return 0; }
    public static int e(String tag, String msg, Throwable tr) { return 0; }
    public static int wtf(String tag, String msg) { return 0; }
    public static int wtf(String tag, Throwable tr) { return 0; }
    public static int wtf(String tag, String msg, Throwable tr) { return 0; }
    public static String getStackTraceString(Throwable tr) { return ""; }
    public static boolean isLoggable(String tag, int level) { return true; }
    public static int println(int priority, String tag, String msg) { return 0; }
    public static final int VERBOSE = 2;
    public static final int DEBUG = 3;
    public static final int INFO = 4;
    public static final int WARN = 5;
    public static final int ERROR = 6;
    public static final int ASSERT = 7;
}
`,
            'android/widget/FrameLayout.java': `
package android.widget;
import android.content.Context;
import android.util.AttributeSet;
import android.view.ViewGroup;
public class FrameLayout extends ViewGroup {
    public FrameLayout(Context context) { super(context); }
    public FrameLayout(Context context, AttributeSet attrs) { super(context, attrs); }
    public FrameLayout(Context context, AttributeSet attrs, int defStyleAttr) { super(context, attrs); }
}
`,
            'android/widget/LinearLayout.java': `
package android.widget;
import android.content.Context;
import android.util.AttributeSet;
import android.view.ViewGroup;
public class LinearLayout extends ViewGroup {
    public LinearLayout(Context context) { super(context); }
    public LinearLayout(Context context, AttributeSet attrs) { super(context, attrs); }
    public LinearLayout(Context context, AttributeSet attrs, int defStyleAttr) { super(context, attrs); }
    public void setOrientation(int orientation) {}
    public static final int HORIZONTAL = 0;
    public static final int VERTICAL = 1;
}
`,
            'android/widget/ProgressBar.java': `
package android.widget;
import android.content.Context;
import android.util.AttributeSet;
import android.view.View;
public class ProgressBar extends View {
    public ProgressBar(Context context) { super(context); }
    public ProgressBar(Context context, AttributeSet attrs) { super(context, attrs); }
    public void setProgress(int progress) {}
    public int getProgress() { return 0; }
    public void setMax(int max) {}
    public int getMax() { return 100; }
    public void setIndeterminate(boolean indeterminate) {}
    public void setVisibility(int v) {}
    public static final int INDETERMINATE = -1;
}
`,
            'android/widget/RelativeLayout.java': `
package android.widget;
import android.content.Context;
import android.util.AttributeSet;
import android.view.ViewGroup;
public class RelativeLayout extends ViewGroup {
    public RelativeLayout(Context context) { super(context); }
    public RelativeLayout(Context context, AttributeSet attrs) { super(context, attrs); }
}
`,
            'android/widget/TextView.java': `
package android.widget;
import android.content.Context;
import android.util.AttributeSet;
public class TextView extends android.view.View {
    public TextView(Context context) { super(context); }
    public TextView(Context context, AttributeSet attrs) { super(context, attrs); }
    public void setText(CharSequence text) {}
    public CharSequence getText() { return ""; }
    public void setTextColor(int color) {}
    public void setTextSize(float size) {}
    public void setGravity(int gravity) {}
    public void setTypeface(android.graphics.Typeface tf) {}
    public void setMaxLines(int maxLines) {}
    public void setSingleLine(boolean singleLine) {}
    public void setEllipsize(TextUtils.TruncateAt where) {}
}
`,
            'android/text/TextUtils.java': `
package android.text;
public class TextUtils {
    public static boolean isEmpty(CharSequence str) { return str == null || str.length() == 0; }
    public static boolean isDigitsOnly(CharSequence str) { return false; }
    public static String join(CharSequence delimiter, Object[] tokens) { return ""; }
    public static String join(CharSequence delimiter, Iterable tokens) { return ""; }
    public static String htmlEncode(String s) { return s; }
    public static CharSequence concat(CharSequence... text) { return ""; }
    public static boolean equals(CharSequence a, CharSequence b) { return false; }
    public static enum TruncateAt { START, MIDDLE, END, MARQUEE }
}
`,
            'android/graphics/Typeface.java': `
package android.graphics;
public class Typeface {
    public static final Typeface DEFAULT = new Typeface();
    public static final Typeface DEFAULT_BOLD = new Typeface();
    public static final Typeface MONOSPACE = new Typeface();
    public static final Typeface SANS_SERIF = new Typeface();
    public static final Typeface SERIF = new Typeface();
    public static Typeface create(String familyName, int style) { return DEFAULT; }
    public static Typeface create(Typeface family, int style) { return DEFAULT; }
    public static Typeface createFromAsset(android.content.res.AssetManager mgr, String path) { return DEFAULT; }
    public static Typeface createFromFile(java.io.File file) { return DEFAULT; }
    public static final int NORMAL = 0;
    public static final int BOLD = 1;
    public static final int ITALIC = 2;
    public static final int BOLD_ITALIC = 3;
}
`,
            'android/graphics/Rect.java': `
package android.graphics;
public class Rect {
    public int left, top, right, bottom;
    public Rect() {}
    public Rect(int left, int top, int right, int bottom) { this.left = left; this.top = top; this.right = right; this.bottom = bottom; }
    public int width() { return right - left; }
    public int height() { return bottom - top; }
    public boolean contains(int x, int y) { return false; }
    public void set(int left, int top, int right, int bottom) {}
    public void setEmpty() { left = top = right = bottom = 0; }
    public boolean isEmpty() { return left >= right || top >= bottom; }
    public void union(Rect r) {}
}
`,
            'android/webkit/WebSettings.java': `
package android.webkit;
public class WebSettings {
    public void setJavaScriptEnabled(boolean flag) {}
    public void setDomStorageEnabled(boolean flag) {}
    public void setAllowFileAccess(boolean allow) {}
    public void setAllowContentAccess(boolean allow) {}
    public void setBuiltInZoomControls(boolean enabled) {}
    public void setDisplayZoomControls(boolean enabled) {}
    public void setUseWideViewPort(boolean use) {}
    public void setLoadWithOverviewMode(boolean overview) {}
    public void setSupportZoom(boolean support) {}
    public void setCacheMode(int mode) {}
    public void setMixedContentMode(int mode) {}
    public void setDatabaseEnabled(boolean enabled) {}
    public void setAppCacheEnabled(boolean enabled) {}
    public void setAppCachePath(String appCachePath) {}
    public void setGeolocationEnabled(boolean enabled) {}
    public void setJavaScriptCanOpenWindowsAutomatically(boolean flag) {}
    public void setSupportMultipleWindows(boolean support) {}
    public void setMediaPlaybackRequiresUserGesture(boolean require) {}
    public void setBlockNetworkImage(boolean flag) {}
    public void setBlockNetworkLoads(boolean flag) {}
    public void setLoadsImagesAutomatically(boolean flag) {}
    public void setUserAgentString(String ua) {}
    public String getUserAgentString() { return ""; }
    public void setDefaultTextEncodingName(String encoding) {}
    public void setTextZoom(int textZoom) {}
    public void setLayoutAlgorithm(LayoutAlgorithm l) {}
    public void setEnableSmoothTransition(boolean enable) {}
    public void setSaveFormData(boolean save) {}
    public void setSavePassword(boolean save) {}
    public void setPluginState(PluginState state) {}
    public static final int LOAD_DEFAULT = -1;
    public static final int LOAD_NORMAL = 0;
    public static final int LOAD_CACHE_ELSE_NETWORK = 1;
    public static final int LOAD_NO_CACHE = 2;
    public static final int LOAD_CACHE_ONLY = 3;
    public static final int MIXED_CONTENT_NEVER_ALLOW = 0;
    public static final int MIXED_CONTENT_ALWAYS_ALLOW = 1;
    public static final int MIXED_CONTENT_COMPATIBILITY_MODE = 2;
    public static enum LayoutAlgorithm { NORMAL, SINGLE_COLUMN, NARROW_COLUMNS }
    public static enum PluginState { ON, OFF, ON_DEMAND }
    public static enum RenderPriority { NORMAL, HIGH, LOW }
}
`,
            'android/webkit/WebView.java': `
package android.webkit;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.net.Uri;
import android.os.Bundle;
import android.util.AttributeSet;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
public class WebView extends View {
    public WebView(Context context) { super(context); }
    public WebView(Context context, AttributeSet attrs) { super(context, attrs); }
    public WebView(Context context, AttributeSet attrs, int defStyleAttr) { super(context, attrs); }
    public void loadUrl(String url) {}
    public void loadUrl(String url, java.util.Map<String, String> additionalHttpHeaders) {}
    public void loadData(String data, String mimeType, String encoding) {}
    public void loadDataWithBaseURL(String baseUrl, String data, String mimeType, String encoding, String historyUrl) {}
    public void stopLoading() {}
    public void reload() {}
    public boolean canGoBack() { return false; }
    public boolean canGoForward() { return false; }
    public void goBack() {}
    public void goForward() {}
    public void goBackOrForward(int steps) {}
    public WebSettings getSettings() { return null; }
    public void setWebViewClient(WebViewClient client) {}
    public void setWebChromeClient(WebChromeClient client) {}
    public void setDownloadListener(DownloadListener listener) {}
    public void setJavaScriptInterface(Object obj, String interfaceName) {}
    public void removeJavascriptInterface(String interfaceName) {}
    public void evaluateJavascript(String script, ValueCallback<String> resultCallback) {}
    public String getUrl() { return ""; }
    public String getTitle() { return ""; }
    public Bitmap getFavicon() { return null; }
    public int getProgress() { return 0; }
    public int getContentHeight() { return 0; }
    public float getScale() { return 1.0f; }
    public void zoomIn() {}
    public void zoomOut() {}
    public boolean zoomBy(float delta) { return false; }
    public void clearCache(boolean includeDiskFiles) {}
    public void clearFormData() {}
    public void clearHistory() {}
    public void clearMatches() {}
    public void clearSslPreferences() {}
    public void requestFocusNodeHref(Message msg) {}
    public void requestImageRef(Message msg) {}
    public void setInitialScale(int scaleInPercent) {}
    public void setHorizontalScrollBarEnabled(boolean enabled) {}
    public void setVerticalScrollBarEnabled(boolean enabled) {}
    public void setScrollbarFadingEnabled(boolean enabled) {}
    public void setOverScrollMode(int mode) {}
    public boolean pageUp(boolean top) { return false; }
    public boolean pageDown(boolean bottom) { return false; }
    public void flingScroll(int vx, int vy) {}
    public static class HitTestResult {
        public static final int UNKNOWN_TYPE = 0;
        public static final int ANCHOR_TYPE = 1;
        public static final int PHONE_TYPE = 2;
        public static final int GEO_TYPE = 3;
        public static final int EMAIL_TYPE = 4;
        public static final int IMAGE_TYPE = 5;
        public static final int SRC_ANCHOR_TYPE = 6;
        public static final int SRC_IMAGE_ANCHOR_TYPE = 7;
        public static final int EDIT_TEXT_TYPE = 8;
        public int getType() { return 0; }
        public String getExtra() { return null; }
    }
    public HitTestResult getHitTestResult() { return null; }
    public void onPause() {}
    public void onResume() {}
    public void pauseTimers() {}
    public void resumeTimers() {}
    public void destroy() {}
    public void setWebContentsDebuggingEnabled(boolean enabled) {}
    public void addJavascriptInterface(Object object, String name) {}
    public boolean canZoomIn() { return false; }
    public boolean canZoomOut() { return false; }
    public void setPictureListener(PictureListener listener) {}
    public interface PictureListener { void onNewPicture(WebView view, Picture picture); }
}
class Picture {}
class Message { public static Message obtain() { return null; } public Object obj; public int arg1, arg2; }
`,
            'android/webkit/WebViewClient.java': `
package android.webkit;
public class WebViewClient {
    public boolean shouldOverrideUrlLoading(WebView view, String url) { return false; }
    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) { return false; }
    public void onPageStarted(WebView view, String url, Bitmap favicon) {}
    public void onPageFinished(WebView view, String url) {}
    public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {}
    public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse errorResponse) {}
    public void onReceivedSslError(WebView view, SslErrorHandler handler, android.net.http.SslError error) {}
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) { return null; }
    public void onLoadResource(WebView view, String url) {}
    public void doUpdateVisitedHistory(WebView view, String url, boolean isReload) {}
    public void onFormResubmission(WebView view, Message dontResend, Message resend) {}
    public void onReceivedHttpAuthRequest(WebView view, HttpAuthHandler handler, String host, String realm) {}
    public void onScaleChanged(WebView view, float oldScale, float newScale) {}
    public void onTooManyRedirects(WebView view, Message cancelMsg, Message continueMsg) {}
    public boolean shouldOverrideKeyEvent(WebView view, KeyEvent event) { return false; }
}
`,
            'android/webkit/WebResourceRequest.java': `
package android.webkit;
import android.net.Uri;
public interface WebResourceRequest {
    Uri getUrl();
    boolean isForMainFrame();
    boolean hasGesture();
    String getMethod();
    java.util.Map<String, String> getRequestHeaders();
}
`,
            'android/webkit/WebResourceResponse.java': `
package android.webkit;
import java.io.InputStream;
public class WebResourceResponse {
    public WebResourceResponse(String mimeType, String encoding, InputStream data) {}
    public String getMimeType() { return null; }
    public String getEncoding() { return null; }
    public InputStream getData() { return null; }
    public int getStatusCode() { return 200; }
    public void setStatusCodeAndReasonPhrase(int statusCode, String reasonPhrase) {}
    public java.util.Map<String, String> getResponseHeaders() { return null; }
}
`,
            'android/webkit/WebResourceError.java': `
package android.webkit;
public class WebResourceError {
    public int getErrorCode() { return 0; }
    public CharSequence getDescription() { return null; }
    public static final int ERROR_AUTHENTICATION = -2;
    public static final int ERROR_TIMEOUT = -8;
}
`,
            'android/webkit/SslErrorHandler.java': `
package android.webkit;
public class SslErrorHandler {
    public void proceed() {}
    public void cancel() {}
}
`,
            'android/webkit/ValueCallback.java': `
package android.webkit;
public interface ValueCallback<T> {
    void onReceiveValue(T value);
}
`,
            'android/webkit/WebChromeClient.java': `
package android.webkit;
import android.graphics.Bitmap;
public class WebChromeClient {
    public void onProgressChanged(WebView view, int newProgress) {}
    public void onReceivedTitle(WebView view, String title) {}
    public void onReceivedIcon(WebView view, Bitmap icon) {}
    public void onReceivedFavicon(WebView view, Bitmap icon) {}
    public void onReceivedTouchIconUrl(WebView view, String url, boolean precomposed) {}
    public void onShowCustomView(View view, CustomViewCallback callback) {}
    public void onHideCustomView() {}
    public boolean onJsAlert(WebView view, String url, String message, JsResult result) { return false; }
    public boolean onJsConfirm(WebView view, String url, String message, JsResult result) { return false; }
    public boolean onJsPrompt(WebView view, String url, String message, String defaultValue, JsPromptResult result) { return false; }
    public boolean onJsBeforeUnload(WebView view, String url, String message, JsResult result) { return false; }
    public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {}
    public void onGeolocationPermissionsHidePrompt() {}
    public void onPermissionRequest(PermissionRequest request) {}
    public void onPermissionRequestCanceled(PermissionRequest request) {}
    public Bitmap getDefaultVideoPoster() { return null; }
    public View getVideoLoadingProgressView() { return null; }
    public void getVisitedHistory(ValueCallback<String[]> callback) {}
    public interface CustomViewCallback { void onCustomViewHidden(); }
}
class GeolocationPermissions {
    public interface Callback {
        void invoke(String origin, boolean allow, boolean retain);
    }
}
class PermissionRequest {
    public String[] getResources() { return new String[0]; }
    public void grant(String[] resources) {}
    public void deny() {}
    public static final String RESOURCE_VIDEO_CAPTURE = "android.webkit.resource.VIDEO_CAPTURE";
    public static final String RESOURCE_AUDIO_CAPTURE = "android.webkit.resource.AUDIO_CAPTURE";
    public static final String RESOURCE_PROTECTED_MEDIA_ID = "android.webkit.resource.PROTECTED_MEDIA_ID";
}
`,
            'android/webkit/JsResult.java': `
package android.webkit;
public class JsResult {
    public boolean getResult() { return false; }
    public void confirm() {}
    public void cancel() {}
}
`,
            'android/webkit/JsPromptResult.java': `
package android.webkit;
public class JsPromptResult extends JsResult {
    public String getStringResult() { return null; }
    public void confirm(String result) {}
}
`,
            'android/webkit/DownloadListener.java': `
package android.webkit;
public interface DownloadListener {
    void onDownloadStart(String url, String userAgent, String contentDisposition, String mimetype, long contentLength);
}
`,
            'android/net/http/SslError.java': `
package android.net.http;
public class SslError {
    public static final int SSL_NOTYETVALIDATED = 0;
    public static final int SSL_UNTRUSTED = 1;
    public static final int SSL_EXPIRED = 2;
    public static final int SSL_IDMISMATCH = 3;
    public static final int SSL_DATE_INVALID = 4;
    public boolean addError(int error) { return false; }
    public boolean hasError(int error) { return false; }
    public int getPrimaryError() { return 0; }
    public String toString() { return ""; }
}
`,
            'android/net/http/SslCertificate.java': `
package android.net.http;
import java.security.cert.X509Certificate;
import java.util.Date;
public class SslCertificate {
    public String getIssuedBy() { return ""; }
    public String getIssuedTo() { return ""; }
    public Date getValidNotAfterDate() { return null; }
    public Date getValidNotBeforeDate() { return null; }
    public static class DName {
        public DName(String dName) {}
        public String getDName() { return ""; }
    }
}
`,
            'android/R.java': `
package android;
public class R {
    public static final class attr {
        public static final int windowBackground = 0;
        public static final int windowNoTitle = 0;
        public static final int windowFullscreen = 0;
        public static final int windowActionBar = 0;
        public static final int windowTitleSize = 0;
        public static final int windowTitleBackgroundColor = 0;
        public static final int textColor = 0;
        public static final int textSize = 0;
    }
    public static final class style {
        public static final int Theme = 0;
        public static final int Theme_NoTitleBar = 0;
        public static final int Theme_NoTitleBar_Fullscreen = 0;
        public static final int Theme_DeviceDefault = 0;
        public static final int Theme_DeviceDefault_NoActionBar = 0;
        public static final int Theme_DeviceDefault_Light = 0;
    }
    public static final class color {
        public static final int black = 0;
        public static final int white = 0;
        public static final int transparent = 0;
        public static final int holo_blue_dark = 0;
    }
    public static final class id {
        public static final int text1 = 16908308;
    }
    public static final class layout {
        public static final int activity_list_item = 0;
        public static final int simple_list_item_1 = 0;
        public static final int simple_list_item_2 = 0;
    }
    public static final class drawable {
        public static final int screen_background_dark = 0;
        public static final int screen_background_light = 0;
        public static final int title_bar = 0;
    }
    public static final class string {
        public static final int ok = 0;
        public static final int cancel = 0;
        public static final int yes = 0;
        public static final int no = 0;
        public static final int copy = 0;
        public static final int paste = 0;
        public static final int cut = 0;
        public static final int select_all = 0;
    }
    public static final class anim {
        public static final int fade_in = 0;
        public static final int fade_out = 0;
        public static final int slide_in_left = 0;
        public static final int slide_out_right = 0;
    }
    public static final class integer {
        public static final int config_shortAnimTime = 200;
        public static final int config_mediumAnimTime = 400;
        public static final int config_longAnimTime = 500;
    }
    public static final class dimen {
        public static final int app_icon_size = 0;
    }
    public static final class bool {
        public static final int config_showNavigationBar = true;
    }
}
`,
        };

        // Write stub files
        for (const [filePath, content] of Object.entries(stubs)) {
            const fullPath = path.join(stubDir, filePath);
            fs.mkdirSync(path.dirname(fullPath), { recursive: true });
            fs.writeFileSync(fullPath, content.trim() + '\n');
        }

        // Compile stubs
        log('Компиляция android stubs...', 'step');
        const allJava = [];
        function walkDir(dir) {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) walkDir(full);
                else if (entry.name.endsWith('.java')) allJava.push(full);
            }
        }
        walkDir(stubDir);

        const compileResult = run(`javac -source 8 -target 8 -d "${classesDir}" -nowarn ${allJava.map(f => `"${f}"`).join(' ')}`, {
            timeout: 60000,
        });

        if (!compileResult.ok) {
            log(`Ошибка компиляции stubs: ${compileResult.stderr}`, 'err');
            return false;
        }

        // Create JAR
        const jarPath = path.join(toolsDir, 'android.jar');
        const jarResult = run(`jar cf "${jarPath}" -C "${classesDir}" .`, {
            timeout: 30000,
        });

        if (!jarResult.ok) {
            log(`Ошибка создания JAR: ${jarResult.stderr}`, 'err');
            return false;
        }

        return true;
    } catch (e) {
        log(`Ошибка генерации android.jar: ${e.message}`, 'err');
        return false;
    } finally {
        // Cleanup temp
        try {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch {}
    }
}

module.exports = { setupEnvironment, checkEnvironment, getToolsDir, isTermux, getTermuxPrefix, run };

// ================== Supabase Client ==================
const SUPABASE_URL = "https://rltdptxnpotfymjqtsvp.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_SBYmfZaJmMsBzbIpDWvh7w_upcmdCNo";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ================== IndexedDB Helper ==================
const DB_NAME = 'MarketplaceDB';
const DB_VERSION = 1;
const STORE_NAME = 'appData';

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function saveToIndexedDB(data) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.put({ id: 'main', data });
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

async function loadFromIndexedDB() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.get('main');
        request.onsuccess = () => resolve(request.result?.data || null);
        request.onerror = () => reject(request.error);
    });
}

async function deleteFromIndexedDB() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.delete('main');
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// ================== Supabase Storage Helpers ==================
const STORAGE_BUCKET = 'marketplace-images';

async function uploadImage(file, path) {
    const { data, error } = await supabaseClient.storage
        .from(STORAGE_BUCKET)
        .upload(path, file, { upsert: true });
    if (error) throw error;
    const { data: urlData } = supabaseClient.storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(path);
    return urlData.publicUrl;
}

async function deleteImage(path) {
    if (!path) return;
    let filePath = path;
    if (path.startsWith('http')) {
        const url = new URL(path);
        const parts = url.pathname.split('/');
        const bucketIndex = parts.indexOf('public') + 1;
        if (bucketIndex && parts[bucketIndex] === STORAGE_BUCKET) {
            filePath = parts.slice(bucketIndex + 1).join('/');
        } else {
            return;
        }
    }
    const { error } = await supabaseClient.storage
        .from(STORAGE_BUCKET)
        .remove([filePath]);
    if (error) console.warn("فشل حذف الصورة القديمة:", error);
}

// ================== إدارة البيانات مع IndexedDB و Supabase ==================
// نضع appData كخاصية عامة لتجنب إعادة التصريح
window.appData = null;
let isOnline = navigator.onLine;

// تحميل البيانات من IndexedDB أولاً ثم تحديث من Supabase
async function loadAppData() {
    let localData = await loadFromIndexedDB();
    if (localData) {
        window.appData = localData;
        if (isOnline) {
            try {
                const remoteData = await fetchFromSupabase();
                if (remoteData) {
                    window.appData = remoteData;
                    await saveToIndexedDB(window.appData);
                }
            } catch (e) { console.warn("تعذر تحديث البيانات من السحابة", e); }
        }
    } else {
        if (isOnline) {
            window.appData = await fetchFromSupabase();
            if (window.appData) await saveToIndexedDB(window.appData);
        } else {
            throw new Error("لا توجد بيانات محلية ولا اتصال بالإنترنت");
        }
    }
    return window.appData;
}

// جلب البيانات من Supabase
async function fetchFromSupabase() {
    try {
        const { data: settings, error: settingsErr } = await supabaseClient
            .from('settings')
            .select('data')
            .eq('id', 'main')
            .single();
        if (settingsErr && settingsErr.code !== 'PGRST116') throw settingsErr;
        if (!settings) return null;

        const [categoriesRes, storesRes, productsRes, testimonialsRes, carouselRes, messagesRes] = await Promise.all([
            supabaseClient.from('categories').select('*'),
            supabaseClient.from('stores').select('*'),
            supabaseClient.from('products').select('*'),
            supabaseClient.from('testimonials').select('*'),
            supabaseClient.from('carousel').select('*'),
            supabaseClient.from('messages').select('*')
        ]);
        if (categoriesRes.error) throw categoriesRes.error;
        if (storesRes.error) throw storesRes.error;
        if (productsRes.error) throw productsRes.error;

        const storesMap = {};
        storesRes.data.forEach(store => {
            if (!storesMap[store.category]) storesMap[store.category] = [];
            storesMap[store.category].push(store);
        });
        const productsMap = {};
        productsRes.data.forEach(prod => {
            if (!productsMap[prod.storeId]) productsMap[prod.storeId] = [];
            productsMap[prod.storeId].push(prod);
        });

        return {
            header: settings.data.header,
            ticker: settings.data.ticker,
            design: settings.data.design,
            categories: categoriesRes.data,
            stores: storesMap,
            products: productsMap,
            testimonials: testimonialsRes.data,
            footer: settings.data.footer,
            settings: settings.data.settings,
            carousel: carouselRes.data,
            messages: messagesRes.data
        };
    } catch (e) {
        console.error("خطأ في جلب البيانات من Supabase:", e);
        throw e;
    }
}

// حفظ البيانات (محلياً + سحابياً إن أمكن)
async function saveAppData(force = false) {
    if (!window.appData) return;
    await saveToIndexedDB(window.appData);
    if (isOnline || force) {
        await pushToSupabase(window.appData);
    }
}

// رفع البيانات إلى Supabase
async function pushToSupabase(data) {
    try {
        await supabaseClient.from('settings').upsert({
            id: 'main',
            data: {
                header: data.header,
                ticker: data.ticker,
                design: data.design,
                footer: data.footer,
                settings: data.settings
            }
        });
        for (const cat of data.categories) await supabaseClient.from('categories').upsert(cat);
        const allStores = [];
        for (const cat in data.stores) allStores.push(...data.stores[cat]);
        for (const store of allStores) await supabaseClient.from('stores').upsert(store);
        const allProducts = [];
        for (const storeId in data.products) {
            for (const prod of data.products[storeId]) allProducts.push({ ...prod, storeId });
        }
        for (const prod of allProducts) await supabaseClient.from('products').upsert(prod);
        for (const t of data.testimonials) await supabaseClient.from('testimonials').upsert(t);
        for (const ad of data.carousel) await supabaseClient.from('carousel').upsert(ad);
        for (const msg of data.messages) await supabaseClient.from('messages').upsert(msg);
        
        if (window.broadcastChannel) window.broadcastChannel.postMessage({ type: 'DB_UPDATE', timestamp: Date.now() });
    } catch (e) {
        console.error("خطأ في رفع البيانات إلى Supabase:", e);
        throw e;
    }
}

// ================== دوال رفع الصور مع الحذف التلقائي ==================
async function uploadAndReplaceImage(file, oldImageUrl, folder = 'images') {
    if (!file) return oldImageUrl;
    const uniqueName = `${folder}/${Date.now()}_${file.name}`;
    const newUrl = await uploadImage(file, uniqueName);
    if (oldImageUrl) {
        try {
            await deleteImage(oldImageUrl);
        } catch (e) { console.warn("تعذر حذف الصورة القديمة", e); }
    }
    return newUrl;
}

// ================== الدوال المساعدة العامة ==================
function sanitizeText(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function showToast(msg, type = 'success') {
    const toast = document.createElement('div');
    toast.className = 'toast-message';
    toast.textContent = msg;
    toast.style.background = type === 'error' ? '#ef4444' : '#10b981';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function handleImageUpload(fileInput, targetInputId, callback) {
    if (fileInput.files && fileInput.files[0]) {
        const file = fileInput.files[0];
        const reader = new FileReader();
        reader.onload = e => {
            document.getElementById(targetInputId).value = e.target.result;
            if (callback) callback(file);
        };
        reader.readAsDataURL(file);
    }
}

// ================== إدارة المستخدمين والسلة ==================
let currentUser = JSON.parse(localStorage.getItem('currentUser')) || null;
let users = JSON.parse(localStorage.getItem('users')) || [];
let cart = JSON.parse(localStorage.getItem('cart')) || [];

function saveUsers() { localStorage.setItem('users', JSON.stringify(users)); }

function updateCartDisplay() {
    // ستُستخدم من index.html
}

function getCurrencySymbol() {
    if (!window.appData) return "ر.س";
    const symbols = { SAR: "ر.س", USD: "$", OMR: "ر.ع.", QAR: "ر.ق", AED: "د.إ" };
    return symbols[window.appData.settings.currency] || "ر.س";
}

function translate(key) {
    if (!window.appData) return key;
    if (window.appData.settings.language === 'en') {
        const translations = {
            'عدد الزوار': 'Visitors', 'سلة التسوق': 'Shopping Cart', 'الإجمالي': 'Total',
            'إرسال عبر واتساب': 'Send via WhatsApp', 'إرسال عبر البريد': 'Send via Email',
            'محادثة مع المدير': 'Chat with Admin', 'إضافة للسلة': 'Add to cart', 'اطلب الان': 'Order now',
            'آراء عملائنا': 'Testimonials', 'تواصل معنا': 'Contact us', 'البريد الإلكتروني': 'Email',
            'الهاتف': 'Phone', 'خدمات الدفع': 'Payment Methods', 'طرق دفع آمنة ومتعددة': 'Secure multiple payment methods',
            'جميع الحقوق محفوظة': 'All rights reserved', 'مجمع أسواق ريادة المستهلك': 'Consumer Leadership Markets',
            'أفضل المتاجر والمنتجات بأفضل الأسعار': 'Best stores and products at best prices',
            'العودة للرئيسية': 'Back to Home', 'زيارة المتجر الأصلي': 'Visit Original Store'
        };
        return translations[key] || key;
    }
    return key;
}

// ================== دوال المستخدمين (تسجيل دخول، إعجابات، مفضلات) ==================
function showLoginDialog() {
    const loginHtml = `<div id="loginModal" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; z-index:10000;"><div style="background:white; padding:30px; border-radius:40px; width:300px;"><h3 style="margin-bottom:20px;">تسجيل الدخول</h3><input type="text" id="loginUsername" placeholder="اسم المستخدم" style="width:100%; padding:10px; margin-bottom:10px; border-radius:40px; border:1px solid #ccc;"><input type="password" id="loginPassword" placeholder="كلمة المرور" style="width:100%; padding:10px; margin-bottom:20px; border-radius:40px; border:1px solid #ccc;"><button onclick="window.performLogin()" style="background:#fbbf24; border:none; padding:10px; width:100%; border-radius:40px; font-weight:bold;">دخول</button><button onclick="window.showRegisterDialog()" style="margin-top:10px; background:none; border:none; color:#3b82f6; cursor:pointer;">إنشاء حساب جديد</button><button onclick="document.getElementById('loginModal').remove()" style="margin-top:10px; background:none; border:none; color:#ef4444; cursor:pointer;">إلغاء</button></div></div>`;
    document.body.insertAdjacentHTML('beforeend', loginHtml);
}

window.showRegisterDialog = function() {
    document.getElementById('loginModal')?.remove();
    const registerHtml = `<div id="registerModal" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; z-index:10000;"><div style="background:white; padding:30px; border-radius:40px; width:300px;"><h3 style="margin-bottom:20px;">إنشاء حساب جديد</h3><input type="text" id="regUsername" placeholder="اسم المستخدم" style="width:100%; padding:10px; margin-bottom:10px; border-radius:40px; border:1px solid #ccc;"><input type="password" id="regPassword" placeholder="كلمة المرور" style="width:100%; padding:10px; margin-bottom:20px; border-radius:40px; border:1px solid #ccc;"><button onclick="window.performRegister()" style="background:#fbbf24; border:none; padding:10px; width:100%; border-radius:40px; font-weight:bold;">تسجيل</button><button onclick="window.showLoginDialog()" style="margin-top:10px; background:none; border:none; color:#3b82f6; cursor:pointer;">لديك حساب؟ سجل دخول</button><button onclick="document.getElementById('registerModal').remove()" style="margin-top:10px; background:none; border:none; color:#ef4444; cursor:pointer;">إلغاء</button></div></div>`;
    document.body.insertAdjacentHTML('beforeend', registerHtml);
};

window.performLogin = function() {
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    const user = users.find(u => u.username === username && u.password === password);
    if (user) {
        currentUser = user;
        localStorage.setItem('currentUser', JSON.stringify(user));
        document.getElementById('loginModal').remove();
        if (window.renderProfilePage) window.renderProfilePage();
    } else alert('اسم المستخدم أو كلمة المرور غير صحيحة');
};

window.performRegister = function() {
    const username = document.getElementById('regUsername').value;
    const password = document.getElementById('regPassword').value;
    if (!username || !password) { alert('الرجاء ملء جميع الحقول'); return; }
    if (users.find(u => u.username === username)) { alert('اسم المستخدم موجود بالفعل'); return; }
    const newUser = { username, password, likes: [], favorites: [], purchases: [] };
    users.push(newUser);
    saveUsers();
    currentUser = newUser;
    localStorage.setItem('currentUser', JSON.stringify(newUser));
    document.getElementById('registerModal').remove();
    if (window.renderProfilePage) window.renderProfilePage();
    supabaseClient.from('users').insert({
        username: newUser.username,
        password: newUser.password,
        likes: [],
        favorites: [],
        purchases: []
    }).then();
};

window.logout = function() {
    currentUser = null;
    localStorage.removeItem('currentUser');
    if (window.showHomePage) window.showHomePage();
};

window.toggleLike = async function(productId, storeId, btn) {
    if (!currentUser) { showLoginDialog(); return; }
    const index = currentUser.likes.indexOf(productId);
    if (index === -1) {
        currentUser.likes.push(productId);
        btn.classList.add('liked');
        btn.innerHTML = '<i class="fas fa-heart"></i>';
    } else {
        currentUser.likes.splice(index, 1);
        btn.classList.remove('liked');
        btn.innerHTML = '<i class="far fa-heart"></i>';
    }
    localStorage.setItem('currentUser', JSON.stringify(currentUser));
    const userIndex = users.findIndex(u => u.username === currentUser.username);
    if (userIndex !== -1) users[userIndex] = currentUser;
    localStorage.setItem('users', JSON.stringify(users));
    await supabaseClient.from('users').update({ likes: currentUser.likes }).eq('username', currentUser.username);
};

window.toggleFavorite = async function(productId, storeId, btn) {
    if (!currentUser) { showLoginDialog(); return; }
    const index = currentUser.favorites.indexOf(productId);
    if (index === -1) {
        currentUser.favorites.push(productId);
        btn.classList.add('favorited');
        btn.innerHTML = '<i class="fas fa-bookmark"></i>';
    } else {
        currentUser.favorites.splice(index, 1);
        btn.classList.remove('favorited');
        btn.innerHTML = '<i class="far fa-bookmark"></i>';
    }
    localStorage.setItem('currentUser', JSON.stringify(currentUser));
    const userIndex = users.findIndex(u => u.username === currentUser.username);
    if (userIndex !== -1) users[userIndex] = currentUser;
    localStorage.setItem('users', JSON.stringify(users));
    await supabaseClient.from('users').update({ favorites: currentUser.favorites }).eq('username', currentUser.username);
};

// ================== دوال التصميم ==================
function applyDesignSettings() {
    if (!window.appData) return;
    const root = document.documentElement;
    root.style.setProperty('--category-bg', window.appData.design.categoryBg);
    root.style.setProperty('--category-text', window.appData.design.categoryText);
    root.style.setProperty('--category-font-size', window.appData.design.categoryFontSize);
    root.style.setProperty('--store-bg', window.appData.design.storeBg);
    root.style.setProperty('--store-text', window.appData.design.storeText);
    root.style.setProperty('--store-font-size', window.appData.design.storeFontSize);
    root.style.setProperty('--product-bg', window.appData.design.productBg);
    root.style.setProperty('--product-text', window.appData.design.productText);
    root.style.setProperty('--product-font-size', window.appData.design.productFontSize);
    root.style.setProperty('--ad-bg', window.appData.design.adBg);
    root.style.setProperty('--ad-text', window.appData.design.adText);
    root.style.setProperty('--ad-font-size', window.appData.design.adFontSize);
    root.style.setProperty('--general-font-size', window.appData.design.generalFontSize);
    document.body.style.fontSize = window.appData.design.generalFontSize;
}

let headerInterval, currentHeaderIndex = 0;
function changeHeaderBackground() {
    const header = document.getElementById('mainHeader');
    if (window.appData && window.appData.header.images && window.appData.header.images.length > 0) {
        header.style.backgroundImage = `url('${window.appData.header.images[currentHeaderIndex]}')`;
        currentHeaderIndex = (currentHeaderIndex + 1) % window.appData.header.images.length;
    }
}
function startHeaderInterval() {
    if (headerInterval) clearInterval(headerInterval);
    changeHeaderBackground();
    headerInterval = setInterval(changeHeaderBackground, 5000);
}

function startCarousel() {
    // ستُستخدم من index.html
}

// ================== رصد حالة الاتصال ==================
window.addEventListener('online', () => {
    isOnline = true;
    if (window.appData) {
        saveAppData(true).catch(e => console.warn("فشلت المزامنة بعد العودة للاتصال", e));
    }
});
window.addEventListener('offline', () => {
    isOnline = false;
    showToast("⚠️ أنت غير متصل، سيتم حفظ البيانات محلياً", 'error');
});

// ================== تصدير الكائنات العامة ==================
window.common = {
    supabaseClient,
    openDB,
    saveToIndexedDB,
    loadFromIndexedDB,
    deleteFromIndexedDB,
    uploadImage,
    deleteImage,
    uploadAndReplaceImage,
    appData: window.appData,
    isOnline,
    loadAppData,
    saveAppData,
    fetchFromSupabase,
    pushToSupabase,
    sanitizeText,
    showToast,
    handleImageUpload,
    currentUser,
    users,
    cart,
    saveUsers,
    updateCartDisplay,
    getCurrencySymbol,
    translate,
    applyDesignSettings,
    startHeaderInterval,
    startCarousel,
    showLoginDialog,
    toggleLike: window.toggleLike,
    toggleFavorite: window.toggleFavorite,
    logout: window.logout
};

// جعل بعض الدوال متاحة عالمياً
window.sanitizeText = sanitizeText;
window.showToast = showToast;
window.handleImageUpload = handleImageUpload;
window.uploadAndReplaceImage = uploadAndReplaceImage;
window.loadAppData = loadAppData;
window.saveAppData = saveAppData;
window.applyDesignSettings = applyDesignSettings;
window.startHeaderInterval = startHeaderInterval;
window.startCarousel = startCarousel;
window.getCurrencySymbol = getCurrencySymbol;
window.translate = translate;

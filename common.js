// ============================================================
// common.js - الملف المشترك النهائي (نسخة آمنة ومعدلة)
// يحتوي على: Supabase, IndexedDB, إدارة البيانات, الصور,
// المستخدمين, السلة, التصميم, الأدوات المساعدة + تشفير كلمة المرور
// مع حساب تلقائي لتجزئة "202122"
// ============================================================

// ================== حقوق التطوير ==================
// هذا الموقع مطور بواسطة المهندس رمزي الصلاحي
// جميع الحقوق محفوظة لمجمع أسواق ريادة المستهلك © 2026
// ===================================================

// ================== إعدادات الأمان والمتغيرات البيئية ==================
// يمكن تجاوز هذه القيم عبر window.ENV (مثال: في ملف env.js)
window.ENV = window.ENV || {};

// مفاتيح Supabase (يُفضل وضعها في متغيرات بيئية على Vercel)
const SUPABASE_URL = window.ENV.SUPABASE_URL || "https://rltdptxnpotfymjqtsvp.supabase.co";
const SUPABASE_ANON_KEY = window.ENV.SUPABASE_ANON_KEY || "sb_publishable_SBYmfZaJmMsBzbIpDWvh7w_upcmdCNo";

// كلمة المرور الافتراضية (تُستخدم للتجزئة التلقائية)
const DEFAULT_PASSWORD = "202122";

// ================== دوال التشفير ==================
// متغير عام لتخزين التجزئة الصحيحة بعد حسابها
let ADMIN_PASSWORD_HASH = null;

/**
 * توليد تجزئة SHA-256 لنص معين
 * @param {string} message - النص المراد تجزئته
 * @returns {Promise<string>} - التجزئة بصيغة سداسية عشرية
 */
async function hashPassword(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * التحقق من صحة كلمة المرور
 * @param {string} inputPassword - كلمة المرور المدخلة
 * @param {string} storedHash - التجزئة المخزنة (اختياري)
 * @returns {Promise<boolean>}
 */
async function verifyPassword(inputPassword, storedHash = null) {
    // إذا لم يتم تمرير تجزئة، نستخدم التجزئة المخزنة عالمياً
    const hashToCompare = storedHash || ADMIN_PASSWORD_HASH;
    
    // إذا لم تكن التجزئة محسوبة بعد (لأي سبب)، نحسبها فوراً
    if (!hashToCompare) {
        await initializeSecurity();
        return verifyPassword(inputPassword);
    }
    
    const inputHash = await hashPassword(inputPassword);
    return inputHash === hashToCompare;
}

/**
 * تهيئة الأمان: حساب تجزئة كلمة المرور الافتراضية
 */
async function initializeSecurity() {
    if (!ADMIN_PASSWORD_HASH) {
        // حساب التجزئة لكلمة المرور الافتراضية "202122"
        ADMIN_PASSWORD_HASH = await hashPassword(DEFAULT_PASSWORD);
        console.log('✅ تم تهيئة الأمان بنجاح (تجزئة كلمة المرور محسوبة تلقائياً)');
        
        // يمكن للمطور تجاوزها عبر window.ENV
        if (window.ENV.ADMIN_PASSWORD_HASH) {
            ADMIN_PASSWORD_HASH = window.ENV.ADMIN_PASSWORD_HASH;
            console.log('✅ تم استخدام التجزئة من window.ENV');
        }
    }
    return ADMIN_PASSWORD_HASH;
}

// تهيئة الأمان فور تحميل الملف (في الخلفية)
initializeSecurity();

// ================== إعدادات Supabase Client ==================
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ================== إعدادات IndexedDB ==================
const DB_NAME = 'MarketplaceDB';
const DB_VERSION = 1;
const STORE_NAME = 'appData';
const BACKUP_STORE_NAME = 'appDataBackup';

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains(BACKUP_STORE_NAME)) {
                db.createObjectStore(BACKUP_STORE_NAME, { keyPath: 'id' });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function saveToIndexedDB(data, storeName = STORE_NAME) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const request = store.put({ id: 'main', data });
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

async function loadFromIndexedDB(storeName = STORE_NAME) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const request = store.get('main');
        request.onsuccess = () => resolve(request.result?.data || null);
        request.onerror = () => reject(request.error);
    });
}

async function deleteFromIndexedDB(storeName = STORE_NAME) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const request = store.delete('main');
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

async function createBackup() {
    const data = await loadFromIndexedDB(STORE_NAME);
    if (data) {
        await saveToIndexedDB(data, BACKUP_STORE_NAME);
        return true;
    }
    return false;
}

async function restoreBackup() {
    const backup = await loadFromIndexedDB(BACKUP_STORE_NAME);
    if (backup) {
        await saveToIndexedDB(backup, STORE_NAME);
        return backup;
    }
    return null;
}

// ================== دوال Storage (رفع وحذف الصور) ==================
const STORAGE_BUCKET = 'images';

async function uploadImage(file, path) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    try {
        const { data, error } = await supabaseClient.storage
            .from(STORAGE_BUCKET)
            .upload(path, file, {
                upsert: true,
                signal: controller.signal
            });
        clearTimeout(timeoutId);
        if (error) throw error;
        const { data: urlData } = supabaseClient.storage
            .from(STORAGE_BUCKET)
            .getPublicUrl(path);
        return urlData.publicUrl;
    } catch (e) {
        clearTimeout(timeoutId);
        if (e.name === 'AbortError') {
            throw new Error('انتهت مهلة رفع الصورة (60 ثانية)');
        }
        throw e;
    }
}

async function deleteImage(path) {
    if (!path) return;
    let filePath = path;
    if (path.startsWith('http')) {
        try {
            const url = new URL(path);
            const parts = url.pathname.split('/');
            const bucketIndex = parts.indexOf('public') + 1;
            if (bucketIndex && parts[bucketIndex] === STORAGE_BUCKET) {
                filePath = parts.slice(bucketIndex + 1).join('/');
            } else {
                return;
            }
        } catch (e) {
            console.warn('⚠️ رابط غير صالح للحذف:', path);
            return;
        }
    }
    const { error } = await supabaseClient.storage
        .from(STORAGE_BUCKET)
        .remove([filePath]);
    if (error) console.warn('⚠️ فشل حذف الصورة:', error);
}

async function uploadAndReplaceImage(file, oldImageUrl, folder = 'images') {
    if (!file) return oldImageUrl;
    const uniqueName = `${folder}/${Date.now()}_${file.name.replace(/\s/g, '_')}`;
    const newUrl = await uploadImage(file, uniqueName);
    if (oldImageUrl) {
        try {
            await deleteImage(oldImageUrl);
            console.log('✅ تم حذف الصورة القديمة:', oldImageUrl);
        } catch (e) {
            console.warn('⚠️ تعذر حذف الصورة القديمة:', e);
        }
    }
    return newUrl;
}

// ================== ضغط الصور ==================
function compressImage(file, maxWidth = 800, maxHeight = 800, quality = 0.7) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                let width = img.width;
                let height = img.height;
                if (width > maxWidth) {
                    height = height * (maxWidth / width);
                    width = maxWidth;
                }
                if (height > maxHeight) {
                    width = width * (maxHeight / height);
                    height = maxHeight;
                }
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob((blob) => {
                    const compressedFile = new File([blob], file.name, {
                        type: 'image/jpeg',
                        lastModified: Date.now()
                    });
                    resolve(compressedFile);
                }, 'image/jpeg', quality);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

// ================== إدارة البيانات مع Supabase و IndexedDB ==================
window.appData = null;
let isOnline = navigator.onLine;

const DEFAULT_WHATSAPP_NUMBER = "967778562099";

let adminErrors = [];
const MAX_ADMIN_ERRORS = 50;

function logAdminError(error, context = '') {
    const entry = {
        time: new Date().toISOString(),
        context,
        message: error.message || error,
        stack: error.stack || ''
    };
    adminErrors.unshift(entry);
    if (adminErrors.length > MAX_ADMIN_ERRORS) adminErrors.pop();
    console.error(`[Admin Error] ${context}:`, error);
}

function getWhatsAppNumber() {
    if (window.appData?.settings?.whatsappNumber) {
        return window.appData.settings.whatsappNumber;
    }
    return DEFAULT_WHATSAPP_NUMBER;
}

function ensureSocialMedia(data) {
    if (!data) return data;
    if (!data.footer) data.footer = {};
    if (!data.footer.socialMedia || !Array.isArray(data.footer.socialMedia) || data.footer.socialMedia.length === 0) {
        const defaultPlatforms = ['whatsapp', 'facebook', 'twitter', 'instagram', 'telegram', 'snapchat', 'linkedin', 'tiktok'];
        data.footer.socialMedia = defaultPlatforms.map(platform => ({
            platform,
            url: '',
            active: true
        }));
    } else {
        const existingPlatforms = data.footer.socialMedia.map(s => s.platform);
        const allPlatforms = ['whatsapp', 'facebook', 'twitter', 'instagram', 'telegram', 'snapchat', 'linkedin', 'tiktok'];
        allPlatforms.forEach(p => {
            if (!existingPlatforms.includes(p)) {
                data.footer.socialMedia.push({ platform: p, url: '', active: true });
            }
        });
    }
    return data;
}

// ================== تحميل البيانات الأساسية ==================
async function loadAppData() {
    let localData = await loadFromIndexedDB();
    if (localData) {
        localData = ensureSocialMedia(localData);
        window.appData = localData;
        if (isOnline) {
            try {
                const remoteData = await fetchFromSupabase();
                if (remoteData) {
                    const oldData = window.appData;
                    window.appData = remoteData;
                    await saveToIndexedDB(window.appData);
                    applyPartialUpdates(oldData, remoteData);
                }
            } catch (e) {
                logAdminError(e, 'loadAppData sync');
            }
        }
    } else {
        if (isOnline) {
            window.appData = await fetchFromSupabase();
            if (window.appData) await saveToIndexedDB(window.appData);
        } else {
            throw new Error('لا توجد بيانات محلية ولا اتصال');
        }
    }
    return window.appData;
}

// ================== جلب البيانات من Supabase ==================
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
            if (!store.banners) store.banners = [];
            storesMap[store.category].push(store);
        });
        const productsMap = {};
        productsRes.data.forEach(prod => {
            if (!productsMap[prod.storeId]) productsMap[prod.storeId] = [];
            productsMap[prod.storeId].push(prod);
        });

        const result = {
            header: settings.data.header || {},
            ticker: settings.data.ticker || [],
            design: settings.data.design || {},
            categories: categoriesRes.data || [],
            stores: storesMap || {},
            products: productsMap || {},
            testimonials: testimonialsRes.data || [],
            footer: settings.data.footer || {},
            settings: settings.data.settings || {},
            carousel: carouselRes.data || [],
            messages: messagesRes.data || []
        };

        // ضمان وجود الحقول الأساسية
        if (!result.settings.visitorCount) result.settings.visitorCount = 0;
        if (!result.settings.saudiFlagUrl) result.settings.saudiFlagUrl = '';
        if (!result.settings.trackingCode) result.settings.trackingCode = '';
        if (!result.settings.whatsappNumber) result.settings.whatsappNumber = DEFAULT_WHATSAPP_NUMBER;
        if (!result.settings.marketPolicy) {
            result.settings.marketPolicy = {
                terms: "هنا تكتب شروط البيع والشراء...",
                returns: "هنا تكتب سياسة الاسترجاع والاستبدال...",
                usage: "هنا تكتب شروط الاستخدام..."
            };
        }
        if (!result.settings.aboutUs) {
            result.settings.aboutUs = {
                description: "هنا تكتب نبذة تعريفية عن السوق...",
                mission: "هنا تكتب رسالة السوق...",
                vision: "هنا تكتب رؤية السوق..."
            };
        }
        if (!result.settings.orderMethods) {
            result.settings.orderMethods = { whatsapp: true, email: true, chat: true };
        }

        // إعدادات الفهرس
        if (!result.settings.indexDisplayMode) result.settings.indexDisplayMode = 'grid';
        if (!result.settings.indexColumns) result.settings.indexColumns = 4;

        ensureSocialMedia(result);
        return result;
    } catch (e) {
        logAdminError(e, 'fetchFromSupabase');
        throw e;
    }
}

// ================== حفظ البيانات إلى Supabase ==================
async function saveAppData(force = false, tables = null) {
    if (!window.appData) return;
    await saveToIndexedDB(window.appData);
    if (isOnline || force) {
        try {
            await Promise.race([
                pushToSupabase(window.appData, tables),
                new Promise((_, reject) => setTimeout(() => reject(new Error('انتهت مهلة المزامنة (30 ثانية)')), 30000))
            ]);
        } catch (e) {
            console.warn('⚠️ فشل دفع البيانات للسحابة:', e);
            logAdminError(e, 'saveAppData push');
        }
    }
}

async function pushToSupabase(data, tables = null) {
    const allTables = !tables || tables.length === 0;

    try {
        if (allTables || tables.includes('settings')) {
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
        }

        if (allTables || tables.includes('categories')) {
            if (data.categories && data.categories.length > 0) {
                await supabaseClient.from('categories').upsert(data.categories);
            }
        }

        if (allTables || tables.includes('stores')) {
            const allStores = [];
            for (const cat in data.stores) {
                for (const store of data.stores[cat]) {
                    if (!store.banners) store.banners = [];
                    allStores.push(store);
                }
            }
            if (allStores.length > 0) {
                await supabaseClient.from('stores').upsert(allStores);
            }
        }

        if (allTables || tables.includes('products')) {
            const allProducts = [];
            for (const storeId in data.products) {
                for (const prod of data.products[storeId]) {
                    allProducts.push({ ...prod, storeId });
                }
            }
            if (allProducts.length > 0) {
                await supabaseClient.from('products').upsert(allProducts);
            }
        }

        if (allTables || tables.includes('testimonials')) {
            if (data.testimonials && data.testimonials.length > 0) {
                await supabaseClient.from('testimonials').upsert(data.testimonials);
            }
        }

        if (allTables || tables.includes('carousel')) {
            if (data.carousel && data.carousel.length > 0) {
                await supabaseClient.from('carousel').upsert(data.carousel);
            }
        }

        if (allTables || tables.includes('messages')) {
            if (data.messages && data.messages.length > 0) {
                await supabaseClient.from('messages').upsert(data.messages);
            }
        }

        if (window.broadcastChannel) {
            window.broadcastChannel.postMessage({ type: 'DB_UPDATE', timestamp: Date.now() });
        }
    } catch (e) {
        logAdminError(e, 'pushToSupabase');
        throw e;
    }
}

// ================== دوال التحديث الجزئي للصور ==================
function applyPartialUpdates(oldData, newData) {
    if (!oldData || !newData) return;

    for (const storeId in newData.products) {
        const newProds = newData.products[storeId] || [];
        const oldProds = (oldData.products && oldData.products[storeId]) || [];
        newProds.forEach(newProd => {
            const oldProd = oldProds.find(p => p.id === newProd.id);
            if (oldProd && oldProd.image !== newProd.image) {
                document.dispatchEvent(new CustomEvent('product-image-updated', {
                    detail: { storeId, productId: newProd.id, newImage: newProd.image }
                }));
            }
        });
    }

    for (const cat in newData.stores) {
        const newStores = newData.stores[cat] || [];
        const oldStores = (oldData.stores && oldData.stores[cat]) || [];
        newStores.forEach(newStore => {
            const oldStore = oldStores.find(s => s.id === newStore.id);
            if (oldStore) {
                if (oldStore.logo !== newStore.logo) {
                    document.dispatchEvent(new CustomEvent('store-logo-updated', {
                        detail: { storeId: newStore.id, newLogo: newStore.logo }
                    }));
                }
                const newBanners = newStore.banners || [];
                const oldBanners = oldStore.banners || [];
                newBanners.forEach(newBanner => {
                    const oldBanner = oldBanners.find(b => b.id === newBanner.id);
                    if (oldBanner) {
                        if (JSON.stringify(oldBanner.images) !== JSON.stringify(newBanner.images)) {
                            document.dispatchEvent(new CustomEvent('store-banner-images-updated', {
                                detail: { storeId: newStore.id, bannerId: newBanner.id, images: newBanner.images }
                            }));
                        }
                        if (oldBanner.content !== newBanner.content) {
                            document.dispatchEvent(new CustomEvent('store-banner-text-updated', {
                                detail: { storeId: newStore.id, bannerId: newBanner.id, content: newBanner.content }
                            }));
                        }
                        if (oldBanner.active !== newBanner.active || oldBanner.type !== newBanner.type || oldBanner.order !== newBanner.order) {
                            document.dispatchEvent(new CustomEvent('store-banner-structure-updated', {
                                detail: { storeId: newStore.id }
                            }));
                        }
                    } else {
                        document.dispatchEvent(new CustomEvent('store-banner-structure-updated', {
                            detail: { storeId: newStore.id }
                        }));
                    }
                });
                if (oldBanners.length !== newBanners.length) {
                    document.dispatchEvent(new CustomEvent('store-banner-structure-updated', {
                        detail: { storeId: newStore.id }
                    }));
                }
            }
        });
    }

    if (newData.categories && oldData.categories) {
        newData.categories.forEach(newCat => {
            const oldCat = oldData.categories.find(c => c.id === newCat.id);
            if (oldCat && (oldCat.featuredImage !== newCat.featuredImage || oldCat.indexImage !== newCat.indexImage)) {
                document.dispatchEvent(new CustomEvent('category-image-updated', {
                    detail: {
                        categoryId: newCat.id,
                        featuredImage: newCat.featuredImage,
                        indexImage: newCat.indexImage
                    }
                }));
            }
        });
    }
}

function updateElementImage(selector, newSrc) {
    const elements = document.querySelectorAll(selector);
    elements.forEach(el => {
        if (el.tagName === 'IMG') el.src = newSrc;
        else if (el.style.backgroundImage) el.style.backgroundImage = `url('${newSrc}')`;
    });
}

// ================== الدوال المساعدة ==================
function sanitizeText(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function showToast(msg, type = 'success', isAdmin = false) {
    if (!isAdmin) {
        const allowed = ['تم تحديث الموقع', 'جاري تحديث الموقع', 'تم إضافة المنتج للسلة', 'تم نسخ الرابط', 'تم تحميل الموقع بنجاح', 'لا توجد بيانات جديدة', 'يرجى المحاولة لاحقاً', '✅ تم تسجيل الدخول بنجاح', 'تم تسجيل الخروج'];
        if (!allowed.includes(msg) && !msg.includes('تم حذف')) {
            msg = type === 'error' ? 'يرجى المحاولة لاحقاً' : 'تم تحديث الموقع';
        }
    }
    const toast = document.createElement('div');
    toast.className = 'toast-message';
    toast.textContent = msg;
    toast.style.background = type === 'error' ? '#ef4444' : '#10b981';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function getCurrencySymbol() {
    if (!window.appData) return "ر.س";
    const symbols = { SAR: "ر.س", USD: "$", OMR: "ر.ع.", QAR: "ر.ق", AED: "د.إ" };
    return symbols[window.appData.settings?.currency] || "ر.س";
}

function translate(key, appData) {
    if (!appData) return key;
    if (appData.settings?.language === 'en') {
        const translations = {
            'عدد الزوار': 'Visitors',
            'سلة التسوق': 'Shopping Cart',
            'الإجمالي': 'Total',
            'إرسال عبر واتساب': 'Send via WhatsApp',
            'إرسال عبر البريد': 'Send via Email',
            'محادثة مع المدير': 'Chat with Admin',
            'إضافة للسلة': 'Add to cart',
            'اطلب الان': 'Order now',
            'آراء عملائنا': 'Testimonials',
            'تواصل معنا': 'Contact us',
            'البريد الإلكتروني': 'Email',
            'الهاتف': 'Phone',
            'خدمات الدفع': 'Payment Methods',
            'طرق دفع آمنة ومتعددة': 'Secure multiple payment methods',
            'جميع الحقوق محفوظة': 'All rights reserved',
            'مجمع أسواق ريادة المستهلك': 'Consumer Leadership Markets',
            'أفضل المتاجر والمنتجات بأفضل الأسعار': 'Best stores and products at best prices',
            'العودة للرئيسية': 'Back to Home',
            'زيارة المتجر الأصلي': 'Visit Original Store',
            'زيارة المتجر': 'Visit Store',
            'زيارة': 'Visit'
        };
        return translations[key] || key;
    }
    return key;
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

// ================== إدارة المستخدمين ==================
let currentUser = JSON.parse(localStorage.getItem('currentUser')) || null;
let users = JSON.parse(localStorage.getItem('users')) || [];
let cart = JSON.parse(localStorage.getItem('cart')) || [];

function saveUsers() { localStorage.setItem('users', JSON.stringify(users)); }

function showLoginDialog() {
    if (!window.appData?.settings?.enableUserProfile) {
        showToast('⚠️ ميزة تسجيل الدخول غير مفعلة حالياً', 'error');
        return;
    }
    const loginHtml = `
        <div id="loginModal" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; z-index:10000;">
            <div style="background:white; padding:30px; border-radius:40px; width:300px;">
                <h3 style="margin-bottom:20px;">تسجيل الدخول</h3>
                <input type="text" id="loginUsername" placeholder="اسم المستخدم" style="width:100%; padding:10px; margin-bottom:10px; border-radius:40px; border:1px solid #ccc;">
                <input type="password" id="loginPassword" placeholder="كلمة المرور" style="width:100%; padding:10px; margin-bottom:20px; border-radius:40px; border:1px solid #ccc;">
                <button onclick="window.performLogin()" style="background:#fbbf24; border:none; padding:10px; width:100%; border-radius:40px; font-weight:bold; cursor:pointer;">دخول</button>
                <button onclick="window.showRegisterDialog()" style="margin-top:10px; background:none; border:none; color:#3b82f6; cursor:pointer;">إنشاء حساب جديد</button>
                <button onclick="document.getElementById('loginModal').remove()" style="margin-top:10px; background:none; border:none; color:#ef4444; cursor:pointer;">إلغاء</button>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', loginHtml);
}

window.showRegisterDialog = function() {
    if (!window.appData?.settings?.enableUserProfile) {
        showToast('⚠️ ميزة إنشاء حساب غير مفعلة حالياً', 'error');
        return;
    }
    document.getElementById('loginModal')?.remove();
    const registerHtml = `
        <div id="registerModal" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; z-index:10000;">
            <div style="background:white; padding:30px; border-radius:40px; width:300px;">
                <h3 style="margin-bottom:20px;">إنشاء حساب جديد</h3>
                <input type="text" id="regUsername" placeholder="اسم المستخدم" style="width:100%; padding:10px; margin-bottom:10px; border-radius:40px; border:1px solid #ccc;">
                <input type="password" id="regPassword" placeholder="كلمة المرور" style="width:100%; padding:10px; margin-bottom:20px; border-radius:40px; border:1px solid #ccc;">
                <button onclick="window.performRegister()" style="background:#fbbf24; border:none; padding:10px; width:100%; border-radius:40px; font-weight:bold; cursor:pointer;">تسجيل</button>
                <button onclick="window.showLoginDialog()" style="margin-top:10px; background:none; border:none; color:#3b82f6; cursor:pointer;">لديك حساب؟ سجل دخول</button>
                <button onclick="document.getElementById('registerModal').remove()" style="margin-top:10px; background:none; border:none; color:#ef4444; cursor:pointer;">إلغاء</button>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', registerHtml);
};

window.performLogin = function() {
    if (!window.appData?.settings?.enableUserProfile) {
        showToast('⚠️ ميزة تسجيل الدخول غير مفعلة', 'error');
        return;
    }
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    const user = users.find(u => u.username === username && u.password === password);
    if (user) {
        currentUser = user;
        localStorage.setItem('currentUser', JSON.stringify(user));
        document.getElementById('loginModal').remove();
        if (window.renderProfilePage) window.renderProfilePage();
        showToast('✅ تم تسجيل الدخول بنجاح', 'success');
    } else {
        showToast('❌ اسم المستخدم أو كلمة المرور غير صحيحة', 'error');
    }
};

window.performRegister = function() {
    if (!window.appData?.settings?.enableUserProfile) {
        showToast('⚠️ ميزة إنشاء حساب غير مفعلة', 'error');
        return;
    }
    const username = document.getElementById('regUsername').value;
    const password = document.getElementById('regPassword').value;
    if (!username || !password) {
        showToast('⚠️ الرجاء ملء جميع الحقول', 'error');
        return;
    }
    if (users.find(u => u.username === username)) {
        showToast('⚠️ اسم المستخدم موجود بالفعل', 'error');
        return;
    }
    const newUser = { username, password, likes: [], favorites: [], purchases: [] };
    users.push(newUser);
    saveUsers();
    currentUser = newUser;
    localStorage.setItem('currentUser', JSON.stringify(newUser));
    document.getElementById('registerModal').remove();
    if (window.renderProfilePage) window.renderProfilePage();
    supabaseClient.from('users').upsert({
        username: newUser.username,
        password: newUser.password,
        likes: [],
        favorites: [],
        purchases: []
    }).then();
    showToast('✅ تم إنشاء الحساب بنجاح', 'success');
};

window.logout = function() {
    currentUser = null;
    localStorage.removeItem('currentUser');
    if (window.showHomePage) window.showHomePage();
    showToast('تم تسجيل الخروج', 'success');
};

// ================== دوال الإعجاب والمفضلة ==================
window.toggleLike = async function(productId, storeId, btn) {
    if (!window.appData?.settings?.enableUserProfile) {
        showToast('⚠️ ميزة الإعجاب غير مفعلة حالياً', 'error');
        return;
    }
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
    saveUsers();
    await supabaseClient.from('users').update({ likes: currentUser.likes }).eq('username', currentUser.username);
};

window.toggleFavorite = async function(productId, storeId, btn) {
    if (!window.appData?.settings?.enableUserProfile) {
        showToast('⚠️ ميزة المفضلة غير مفعلة حالياً', 'error');
        return;
    }
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
    saveUsers();
    await supabaseClient.from('users').update({ favorites: currentUser.favorites }).eq('username', currentUser.username);
};

// ================== دوال السلة الكاملة ==================
function updateCartDisplay(appData) {
    const cartCountEl = document.getElementById('cartCount');
    const cartItemsEl = document.getElementById('cartItems');
    const cartTotalEl = document.getElementById('cartTotal');
    const cartActionsEl = document.getElementById('cartActions');

    if (!cartCountEl || !cartItemsEl || !cartTotalEl || !cartActionsEl) return;

    cartCountEl.textContent = cart.length;

    if (cart.length === 0) {
        cartItemsEl.innerHTML = '<p style="text-align:center; margin:20px;">السلة فارغة</p>';
        cartTotalEl.textContent = 'الإجمالي: 0';
        cartActionsEl.innerHTML = '';
        return;
    }

    let itemsHtml = '';
    let total = 0;
    cart.forEach((item, idx) => {
        total += item.newPrice;
        itemsHtml += `
            <div class="cart-item">
                <img src="${item.image}" alt="${item.name}">
                <div class="cart-item-details">
                    <div class="cart-item-name">${sanitizeText(item.name)}</div>
                    <div class="cart-item-price">${item.newPrice} ${getCurrencySymbol()}</div>
                </div>
                <span class="cart-item-remove" onclick="removeFromCart(${idx})">
                    <i class="fas fa-trash"></i>
                </span>
            </div>
        `;
    });

    cartItemsEl.innerHTML = itemsHtml;
    cartTotalEl.textContent = `الإجمالي: ${total} ${getCurrencySymbol()}`;

    const waNumber = getWhatsAppNumber();
    let actionsHtml = '';
    if (appData?.settings?.orderMethods?.whatsapp) {
        let message = "مرحباً، طلبيتي:\n";
        cart.forEach((item, i) => {
            message += `${i+1}. ${item.name} - ${item.newPrice} ${getCurrencySymbol()}\n`;
        });
        actionsHtml += `<button class="whatsapp" onclick="window.open('https://wa.me/${waNumber}?text=${encodeURIComponent(message)}', '_blank')"><i class="fab fa-whatsapp"></i> ${translate('إرسال عبر واتساب', appData)}</button>`;
    }
    if (appData?.settings?.orderMethods?.email) {
        let emailBody = "مرحباً، طلبيتي:%0D%0A";
        cart.forEach((item, i) => {
            emailBody += `${i+1}. ${item.name} - ${item.newPrice} ${getCurrencySymbol()}%0D%0A`;
        });
        actionsHtml += `<button class="email" onclick="window.open('mailto:${appData.settings.contactEmail || ''}?subject=طلب جديد&body=${emailBody}')"><i class="fas fa-envelope"></i> ${translate('إرسال عبر البريد', appData)}</button>`;
    }
    if (appData?.settings?.orderMethods?.chat) {
        actionsHtml += `<button class="chat" onclick="alert('سيتم فتح المحادثة قريباً')"><i class="fas fa-comment"></i> ${translate('محادثة مع المدير', appData)}</button>`;
    }
    cartActionsEl.innerHTML = actionsHtml;
}

function removeFromCart(index) {
    cart.splice(index, 1);
    localStorage.setItem('cart', JSON.stringify(cart));
    updateCartDisplay(window.appData);
}

window.addToCart = function(product, appData) {
    if (!appData?.settings?.cartEnabled) {
        showToast('⚠️ سلة التسوق غير مفعلة', 'error');
        return;
    }
    cart.push(product);
    localStorage.setItem('cart', JSON.stringify(cart));
    updateCartDisplay(appData);
    showToast('✅ تم إضافة المنتج للسلة', 'success');
};

// ================== دوال التصميم ==================
function applyDesignSettings() {
    if (!window.appData) return;
    const root = document.documentElement;
    const d = window.appData.design || {};
    root.style.setProperty('--category-bg', d.categoryBg || 'linear-gradient(145deg, #f9eef7, #f3d9e8)');
    root.style.setProperty('--category-text', d.categoryText || '#9b4d96');
    root.style.setProperty('--category-font-size', d.categoryFontSize || '2rem');
    root.style.setProperty('--store-bg', d.storeBg || '#ffffff');
    root.style.setProperty('--store-text', d.storeText || '#1e293b');
    root.style.setProperty('--store-font-size', d.storeFontSize || '1.3rem');
    root.style.setProperty('--product-bg', d.productBg || '#ffffff');
    root.style.setProperty('--product-text', d.productText || '#1e293b');
    root.style.setProperty('--product-font-size', d.productFontSize || '0.85rem');
    root.style.setProperty('--ad-bg', d.adBg || 'linear-gradient(90deg, #fbbf24, #f59e0b)');
    root.style.setProperty('--ad-text', d.adText || '#0f172a');
    root.style.setProperty('--ad-font-size', d.adFontSize || '1.1rem');
    root.style.setProperty('--general-font-size', d.generalFontSize || '1rem');
    document.body.style.fontSize = d.generalFontSize || '1rem';
}

// ================== PWA والتثبيت ==================
let deferredPrompt;
let installToastTimeout;

function showInstallToast() {
    const existing = document.getElementById('installToast');
    if (existing) existing.remove();
    if (installToastTimeout) clearTimeout(installToastTimeout);

    const toast = document.createElement('div');
    toast.id = 'installToast';
    toast.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:space-between; background:#fbbf24; color:#0f172a; padding:6px 12px; border-radius:0 0 12px 12px; box-shadow:0 2px 8px rgba(0,0,0,0.2); font-family:'Cairo',sans-serif; font-weight:600; gap:6px; font-size:0.8rem;">
            <span style="display:flex; align-items:center; gap:4px;"><i class="fas fa-download" style="font-size:0.9rem;"></i> تثبيت التطبيق</span>
            <button id="installNowBtn" style="background:#0f172a; color:#fbbf24; border:none; padding:3px 10px; border-radius:20px; font-weight:bold; cursor:pointer; font-size:0.7rem;">تثبيت</button>
            <button id="dismissInstallBtn" style="background:transparent; border:none; color:#0f172a; font-size:0.9rem; cursor:pointer; padding:0 2px;">✕</button>
        </div>
    `;
    toast.style.cssText = `
        position: fixed;
        top: 0;
        left: 50%;
        transform: translate(-50%, 0);
        z-index: 9999;
        max-width: 90%;
        width: auto;
        animation: slideDown 0.25s ease forwards;
        border-radius: 0 0 12px 12px;
        overflow: hidden;
    `;
    document.body.appendChild(toast);

    document.getElementById('installNowBtn').addEventListener('click', async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            console.log(`المستخدم اختار: ${outcome}`);
            deferredPrompt = null;
        }
        toast.style.animation = 'fadeOut 0.2s ease forwards';
        setTimeout(() => toast.remove(), 200);
        clearTimeout(installToastTimeout);
    });

    document.getElementById('dismissInstallBtn').addEventListener('click', () => {
        toast.style.animation = 'fadeOut 0.2s ease forwards';
        setTimeout(() => toast.remove(), 200);
        clearTimeout(installToastTimeout);
    });

    installToastTimeout = setTimeout(() => {
        if (toast.parentNode) {
            toast.style.animation = 'fadeOut 0.2s ease forwards';
            setTimeout(() => toast.remove(), 200);
        }
    }, 5000);
}

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    showInstallToast();
});

window.addEventListener('appinstalled', () => {
    const toast = document.getElementById('installToast');
    if (toast) {
        toast.style.animation = 'fadeOut 0.2s ease forwards';
        setTimeout(() => toast.remove(), 200);
    }
    deferredPrompt = null;
    clearTimeout(installToastTimeout);
});

// ================== رصد حالة الاتصال ==================
window.addEventListener('online', () => {
    isOnline = true;
    if (window.appData) {
        saveAppData(true).catch(e => logAdminError(e, 'online sync'));
    }
});
window.addEventListener('offline', () => {
    isOnline = false;
    showToast("⚠️ أنت غير متصل، سيتم حفظ البيانات محلياً", 'error');
});

// ================== تسجيل Service Worker ==================
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js')
            .then(reg => console.log('✅ SW مسجل'))
            .catch(err => console.warn('⚠️ فشل تسجيل SW', err));
    });
}

// ================== تصدير الكائنات العامة ==================
window.common = {
    supabaseClient,
    openDB,
    saveToIndexedDB,
    loadFromIndexedDB,
    deleteFromIndexedDB,
    createBackup,
    restoreBackup,
    uploadImage,
    deleteImage,
    uploadAndReplaceImage,
    compressImage,
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
    removeFromCart,
    addToCart: window.addToCart,
    getCurrencySymbol,
    translate,
    applyDesignSettings,
    showLoginDialog,
    toggleLike: window.toggleLike,
    toggleFavorite: window.toggleFavorite,
    logout: window.logout,
    logAdminError,
    getWhatsAppNumber,
    applyPartialUpdates,
    updateElementImage,
    adminErrors,
    DEFAULT_WHATSAPP_NUMBER,
    ensureSocialMedia,
    STORAGE_BUCKET,
    // دوال التشفير
    hashPassword,
    verifyPassword,
    ADMIN_PASSWORD_HASH,
    initializeSecurity
};

// دوال عالمية للمكالمات المباشرة
window.sanitizeText = sanitizeText;
window.showToast = showToast;
window.handleImageUpload = handleImageUpload;
window.uploadAndReplaceImage = uploadAndReplaceImage;
window.loadAppData = loadAppData;
window.saveAppData = saveAppData;
window.applyDesignSettings = applyDesignSettings;
window.getCurrencySymbol = getCurrencySymbol;
window.translate = translate;
window.logAdminError = logAdminError;
window.getWhatsAppNumber = getWhatsAppNumber;
window.applyPartialUpdates = applyPartialUpdates;
window.updateElementImage = updateElementImage;
window.updateCartDisplay = updateCartDisplay;
window.removeFromCart = removeFromCart;
window.ensureSocialMedia = ensureSocialMedia;
window.createBackup = createBackup;
window.restoreBackup = restoreBackup;
window.hashPassword = hashPassword;
window.verifyPassword = verifyPassword;
window.ADMIN_PASSWORD_HASH = ADMIN_PASSWORD_HASH;
window.initializeSecurity = initializeSecurity;

console.log('✅ common.js تم تحميله بنجاح (النسخة النهائية الآمنة مع حساب تلقائي لكلمة المرور)');
console.log('🛡️ هذا الموقع مطور بواسطة المهندس رمزي الصلاحي - جميع الحقوق محفوظة لمجمع أسواق ريادة المستهلك © 2026');
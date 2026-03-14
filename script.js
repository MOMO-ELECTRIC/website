const i18n = {
  zh: {
    brandTag: '执照电力承包商 · Southern California',
    navServices: '主营业务',
    navRebate: '补贴入口',
    navContact: '联系我们',
    eyebrow: 'POWERING HOMES, BUSINESSES, AND FUTURE ENERGY',
    heroTitle: '点亮南加州',
    heroText: 'MOMO Electrical Services LLC 为住宅与商业客户提供专业电力解决方案，专注于储能系统、配电箱升级、住宅电力服务和商业电力服务。',
    ctaCall: '立即获取报价',
    ctaRebate: '进入 SCE / EV 补贴入口',
    metaLicense: 'CSLB LICENSE #1147309',
    metaSce: 'SCE 认证',
    metaTesla: 'Tesla 认证',
    metaAnker: 'Anker 认证',
    svc1: '储能系统 Energy Storage System',
    svc2: '住宅电力服务 Residential Electrical Services',
    svc3: '配电箱升级 Panel Upgrade',
    svc4: '商业电力服务 Commercial Electrical Services',
    panelServicesKicker: '服务流程',
    panelServicesTitle: '全栈电力服务',
    panelServicesItem1Title: '查勘报价',
    panelServicesItem1: '现场查勘、范围确认更清楚，前期报价更准确。',
    panelServicesItem2Title: '报批许可',
    panelServicesItem2: '具备大量城市 permit 办理经验，熟悉实际报批流程。',
    panelServicesItem3Title: '施工交付',
    panelServicesItem3: '坚持高标准施工，严格遵守 code 要求，并具备丰富 AHJ inspection 经验。',
    panelServicesItem4Title: '质保支持',
    panelServicesItem4: '项目完成后提供清晰、可靠的 warranty 保障与后续支持。',
    panelServicesItem5Title: '全面 Warranty 保障',
    panelServicesItem5: '项目完成后仍有清晰的后续支持和 warranty 保障，不是做完就消失。',
    panelRebateKicker: 'EV REBATE',
    panelRebateTitle: '如果你是来申请补贴，直接进入专门入口就行。',
    panelRebateText: '官网主站专注品牌、执照与主营业务说明；补贴客户则可以直接进入专门页面，流程更清楚，转化也更直接。',
    panelRebateNote: '这样可以让官网保持专业简洁，同时保留独立的补贴获客入口。',
    panelContactKicker: 'CONTACT US',
    panelContactTitle: '联系我们',
    panelQuoteKicker: 'GET A QUOTE',
    panelQuoteTitle: '立即提交询价',
    contactLead: '我们将会第一时间回复您的请求。',
    contactPhone: 'SERVICE LINE',
    contactEmail: '邮件',
    contactWechat: '微信二维码',
    formName: '姓名',
    formNamePlaceholder: '请输入姓名',
    formContact: '联系方式',
    formContactPlaceholder: '电话、邮箱或微信',
    formNeed: '业务需求简介',
    formNeedPlaceholder: '例如：Panel Upgrade、储能系统、住宅电力改造、商业项目等',
    formSubmit: '立即提交询价',
    footerRight: '执照电力承包商 · 服务 Southern California'
  },
  en: {
    brandTag: 'Licensed Electrical Contractor · Southern California',
    navServices: 'Services',
    navRebate: 'Rebate',
    navContact: 'Get a Quote',
    eyebrow: 'POWERING HOMES, BUSINESSES, AND FUTURE ENERGY',
    heroTitle: 'We Energize So-Cal',
    heroText: 'MOMO Electrical Services LLC provides professional electrical solutions for homes and businesses, with a focus on energy storage systems, panel upgrades, residential electrical services, and commercial electrical services.',
    ctaCall: 'Get a Quote Now',
    ctaRebate: 'SCE / EV Rebate Entry',
    metaLicense: 'CSLB LICENSE #1147309',
    metaSce: 'SCE Certified',
    metaTesla: 'Tesla Certified',
    metaAnker: 'Anker Certified',
    svc1: 'Energy Storage System',
    svc2: 'Residential Electrical Services',
    svc3: 'Panel Upgrade',
    svc4: 'Commercial Electrical Services',
    panelServicesKicker: 'SERVICE FLOW',
    panelServicesTitle: 'Full-Stack Electrical Services',
    panelServicesItem1Title: 'Estimate',
    panelServicesItem1: 'On-site assessment, clear scope, and accurate pricing upfront.',
    panelServicesItem2Title: 'Permitting',
    panelServicesItem2: 'Hundreds of city permit cases with practical permitting experience.',
    panelServicesItem3Title: 'Performance',
    panelServicesItem3: 'High-standard workmanship, code compliance, and strong AHJ inspection readiness.',
    panelServicesItem4Title: 'Warranty',
    panelServicesItem4: 'Dependable post-project support with clear warranty coverage.',
    panelServicesItem5Title: 'Comprehensive Warranty Coverage',
    panelServicesItem5: 'Projects are backed by dependable follow-through and clear warranty support after completion.',
    panelRebateKicker: 'EV REBATE',
    panelRebateTitle: 'Need the rebate path? Go directly to the dedicated intake page.',
    panelRebateText: 'The main company website stays focused on brand, licensing, and core services. Rebate customers can go straight to the dedicated portal without extra steps.',
    panelRebateNote: 'This keeps the company website clean while preserving a direct, conversion-focused rebate entry point.',
    panelContactKicker: 'CONTACT US',
    panelContactTitle: 'Contact Us',
    panelQuoteKicker: 'GET A QUOTE',
    panelQuoteTitle: 'Submit a quote request now',
    contactLead: 'We will respond to your request as soon as possible.',
    contactPhone: 'SERVICE LINE',
    contactEmail: 'Email',
    contactWechat: 'WeChat QR Code',
    formName: 'Name',
    formNamePlaceholder: 'Your name',
    formContact: 'Contact info',
    formContactPlaceholder: 'Phone, email, or WeChat',
    formNeed: 'Project summary',
    formNeedPlaceholder: 'Example: panel upgrade, energy storage system, residential electrical work, or commercial project',
    formSubmit: 'Submit quote request now',
    footerRight: 'Licensed contractor serving Southern California'
  }
};

const attrMap = {
  'nav.services': 'navServices',
  'nav.rebate': 'navRebate',
  'nav.contact': 'navContact'
};

function applyLang(lang) {
  const dict = i18n[lang] || i18n.zh;
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.dataset.i18n;
    const value = dict[attrMap[key] || key];
    if (value) el.textContent = value;
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.dataset.i18nPlaceholder;
    const value = dict[key];
    if (value) el.setAttribute('placeholder', value);
  });
  document.querySelectorAll('.lang-toggle').forEach((btn) => {
    btn.textContent = lang === 'zh' ? 'EN / 中文' : '中文 / EN';
  });
  localStorage.setItem('momo-lang', lang);
}

function activatePanel(name) {
  document.querySelectorAll('.nav-pill').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.panel === name);
  });
  document.querySelectorAll('.panel-card').forEach((card) => {
    card.classList.toggle('is-active', card.dataset.panelContent === name);
  });

  const showContactHero = name === 'contact';
  document.querySelector('[data-hero-copy="default"]')?.classList.toggle('is-active', !showContactHero);
  document.querySelector('[data-hero-copy="contact"]')?.classList.toggle('is-active', showContactHero);
}

const initialLang = localStorage.getItem('momo-lang') || 'zh';
applyLang(initialLang);
activatePanel('services');

document.querySelectorAll('.lang-toggle').forEach((btn) => {
  btn.addEventListener('click', () => {
    const next = (localStorage.getItem('momo-lang') || 'zh') === 'zh' ? 'en' : 'zh';
    applyLang(next);
  });
});

document.querySelectorAll('.nav-pill').forEach((btn) => {
  btn.addEventListener('click', () => activatePanel(btn.dataset.panel));
});

const quoteCta = document.getElementById('quoteCta');
if (quoteCta) {
  quoteCta.addEventListener('click', (event) => {
    event.preventDefault();
    activatePanel('contact');
    document.getElementById('quote')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    document.getElementById('quoteName')?.focus();
  });
}

const quoteForm = document.getElementById('quoteForm');
if (quoteForm) {
  quoteForm.addEventListener('submit', (event) => {
    event.preventDefault();

    const lang = localStorage.getItem('momo-lang') || 'zh';
    const name = document.getElementById('quoteName')?.value.trim();
    const contact = document.getElementById('quoteContact')?.value.trim();
    const need = document.getElementById('quoteNeed')?.value.trim();

    if (!name || !contact || !need) return;

    const subject = lang === 'zh'
      ? `网站报价咨询 - ${name}`
      : `Website Quote Request - ${name}`;

    const body = lang === 'zh'
      ? `您好，\n\n我想咨询报价，信息如下：\n\n姓名：${name}\n联系方式：${contact}\n业务需求简介：${need}\n\n谢谢。`
      : `Hello,\n\nI would like to request a quote. My information is below:\n\nName: ${name}\nContact info: ${contact}\nProject summary: ${need}\n\nThank you.`;

    const mailto = `mailto:customer@momoelec.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
  });
}


const appShell = document.querySelector('.app-shell');
const menuToggle = document.getElementById('menuToggle');

function setMenuOpen(open) {
  if (!appShell || !menuToggle) return;
  appShell.classList.toggle('nav-open', open);
  menuToggle.classList.toggle('is-open', open);
  menuToggle.setAttribute('aria-expanded', String(open));
}

if (menuToggle) {
  menuToggle.addEventListener('click', () => {
    setMenuOpen(!appShell.classList.contains('nav-open'));
  });
}

document.querySelectorAll('.nav-pill').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (window.innerWidth <= 820) setMenuOpen(false);
  });
});

document.querySelectorAll('.lang-toggle').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (window.innerWidth <= 820) setMenuOpen(false);
  });
});

window.addEventListener('resize', () => {
  if (window.innerWidth > 980) setMenuOpen(false);
});

const i18n = {
  zh: {
    brandTag: '持证电力承包商 · Southern California',
    navServices: '主营业务',
    navRebate: 'SCE电箱升级补贴',
    navContact: '联系方式',
    eyebrow: 'POWERING HOMES, BUSINESSES, AND FUTURE ENERGY',
    heroTitle: '专业、清晰、可信赖的电力解决方案',
    heroText: 'MOMO Electrical Services LLC 专注于储能系统、住宅电力服务、配电箱升级和商业电力服务。页面保留独立 SCE电箱升级补贴入口，让主营业务和补贴申请逻辑清晰分开。',
    metaLicense: 'CSLB LICENSE #1147309',
    metaSce: 'SCE 认证',
    metaTesla: 'Tesla 认证',
    metaAnker: 'Anker 认证',
    svc1: '储能系统 Energy Storage System',
    svc2: '住宅电力服务 Residential Electrical Services',
    svc3: '配电箱升级 Panel Upgrade',
    svc4: '商业电力服务 Commercial Electrical Services',
    panelServicesKicker: 'CORE SERVICES',
    panelServicesTitle: '主营业务聚焦在真正有转化价值的电力服务',
    panelServicesItem1: '储能系统设计与安装，适配家庭能源升级需求',
    panelServicesItem2: '住宅电力服务，处理新增回路、日常配电与系统优化',
    panelServicesItem3: 'Panel Upgrade，提升容量、安全性和未来扩展能力',
    panelServicesItem4: '商业电力服务，强调现场执行与项目配合',
    panelRebateKicker: 'SCE PANEL UPGRADE REBATE',
    panelRebateTitle: 'SCE电箱升级补贴单独成页，不和主营业务混在一起',
    panelRebateText: '官网主页面负责品牌、执照与业务说明；SCE电箱升级补贴则单独保留专门入口，方便客户直接进入表单。',
    panelRebateNote: '建议后续将这个入口做成主站顶部固定 Tab 与独立落地页。',
    panelContactKicker: 'CONTACT',
    panelContactTitle: '让客户一眼就知道你是谁、做什么、怎么联系',
    contactCompany: '公司',
    contactOwner: '负责人 / 创始人',
    contactPhone: '电话',
    contactEmail: '邮箱',
    footerRight: '中英双语单页官网概念版'
  },
  en: {
    brandTag: 'Licensed Contractor · Southern California',
    navServices: 'Services',
    navRebate: 'SCE Panel Upgrade Rebate',
    navContact: 'Contact',
    eyebrow: 'POWERING HOMES, BUSINESSES, AND FUTURE ENERGY',
    heroTitle: 'Reliable, clear, and trustworthy electrical solutions',
    heroText: 'MOMO Electrical Services LLC focuses on energy storage systems, residential electrical services, panel upgrades, and commercial electrical services, while keeping EV Rebate as a separate and clear pathway.',
    metaLicense: 'CSLB LICENSE #1147309',
    metaSce: 'SCE Certified',
    metaTesla: 'Tesla Certified',
    metaAnker: 'Anker Certified',
    svc1: 'Energy Storage System',
    svc2: 'Residential Electrical Services',
    svc3: 'Panel Upgrade',
    svc4: 'Commercial Electrical Services',
    panelServicesKicker: 'CORE SERVICES',
    panelServicesTitle: 'Core services centered on practical electrical work that converts',
    panelServicesItem1: 'Energy storage system solutions for modern home energy upgrades',
    panelServicesItem2: 'Residential electrical services for circuits, power distribution, and day-to-day needs',
    panelServicesItem3: 'Panel upgrades that improve capacity, safety, and future readiness',
    panelServicesItem4: 'Commercial electrical services with a focus on execution and jobsite coordination',
    panelRebateKicker: 'EV REBATE',
    panelRebateTitle: 'EV rebate lives in its own path, separate from the core company message',
    panelRebateText: 'The main website should explain the brand, license, and service scope. EV Rebate should stay as a separate direct entry point for customers.',
    panelRebateNote: 'Recommended next step: turn this into a dedicated top navigation tab plus its own landing page.',
    panelContactKicker: 'CONTACT',
    panelContactTitle: 'Make it instantly clear who you are, what you do, and how to reach you',
    contactCompany: 'Company',
    contactOwner: 'Owner / Founder',
    contactPhone: 'Phone',
    contactEmail: 'Email',
    footerRight: 'Single-page bilingual landing concept'
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
  if (window.innerWidth > 820) setMenuOpen(false);
});

window.NERIX_CHAT={apiBase:location.origin,siteKey:new URLSearchParams(location.search).get('site')||'nerix-global',privacyUrl:'https://nerixglobal.com/privacy.html',previewCredentials:true};
const script=document.createElement('script');script.src='/chat-widget.js';document.head.append(script);

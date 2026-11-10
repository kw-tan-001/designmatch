// Marks the page as script-enabled before first paint, so reveal-on-scroll styles
// only hide content when JavaScript is there to show it again. (External file: the CSP blocks inline scripts.)
document.documentElement.classList.add('js');

import { useEffect, useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';
export function useNativeViewport() {
  useEffect(() => {
    const update = () => {
      const v = window.visualViewport;
      document.documentElement.style.setProperty('--visual-height', (v?.height ?? innerHeight) + 'px');
      document.documentElement.style.setProperty('--visual-top', (v?.offsetTop ?? 0) + 'px');
      document.documentElement.style.setProperty('--keyboard-inset', Math.max(0, innerHeight - (v?.height ?? innerHeight) - (v?.offsetTop ?? 0)) + 'px');
    };
    let pointerActive = false;
    let awaitingClick = false;
    let focusFrame = 0;
    let pointerTimer = 0;
    const focus = () => {
      if (pointerActive || awaitingClick) return;
      const tag = document.activeElement?.tagName;
      document.documentElement.dataset.editing = ['INPUT','TEXTAREA','SELECT'].includes(tag ?? '') ? 'true' : 'false';
      update();
    };
    const finishFocus = () => { awaitingClick = false; clearTimeout(pointerTimer); cancelAnimationFrame(focusFrame); focusFrame = requestAnimationFrame(focus); };
    const pointerDown = () => { pointerActive = true; clearTimeout(pointerTimer); };
    const pointerEnd = (event: PointerEvent) => {
      pointerActive = false;
      if (event.type === 'pointercancel') { finishFocus(); return; }
      awaitingClick = true;
      // Preserve hit targets until the browser completes its native click.
      // Disabled elements may not produce a click, so retain a bounded fallback.
      pointerTimer = window.setTimeout(finishFocus, 400);
    };
    const click = () => { if (!pointerActive) finishFocus(); };
    update();
    window.visualViewport?.addEventListener('resize', update, { passive: true });
    window.visualViewport?.addEventListener('scroll', update, { passive: true });
    document.addEventListener('focusin', focus); document.addEventListener('focusout', focus);
    document.addEventListener('pointerdown',pointerDown,{capture:true,passive:true});
    document.addEventListener('pointerup',pointerEnd,{capture:true,passive:true});
    document.addEventListener('pointercancel',pointerEnd,{capture:true,passive:true});
    document.addEventListener('click',click,{capture:true,passive:true});
    return () => { window.visualViewport?.removeEventListener('resize',update); window.visualViewport?.removeEventListener('scroll',update); document.removeEventListener('focusin',focus); document.removeEventListener('focusout',focus); document.removeEventListener('pointerdown',pointerDown,true); document.removeEventListener('pointerup',pointerEnd,true); document.removeEventListener('pointercancel',pointerEnd,true); document.removeEventListener('click',click,true); cancelAnimationFrame(focusFrame); clearTimeout(pointerTimer); };
  },[]);
}
const routePositions = new Map<string,number>();
export function rememberRouteScroll(path: string) { routePositions.set(path,window.scrollY); }
export function RouteScroll() {
  const { pathname } = useLocation();
  useLayoutEffect(() => {
    const target = routePositions.get(pathname) ?? 0;
    const restore = () => window.scrollTo(0,target);
    restore();
    const frame = requestAnimationFrame(restore);
    // Route layout and focus can settle after the layout effect. Do not let an
    // outgoing scroll event overwrite the saved position of the new route.
    return () => cancelAnimationFrame(frame);
  },[pathname]);
  return null;
}

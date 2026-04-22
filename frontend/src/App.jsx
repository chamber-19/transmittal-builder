import { useState, useCallback, useRef, useEffect, useId } from "react";
import { initBackendUrl, refreshBackendUrl, getBackendUrl } from "./api/backend.js";
import { UpdateModal } from "@chamber-19/desktop-toolkit/components/UpdateModal";

/* global __APP_VERSION__ */
// Sourced from Vite's define block (vite.config.js), which reads package.json.
// Falls back to "0.0.0" when running outside Vite (e.g. plain browser preview).
const APP_VERSION = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.0.0";

/* ═══════════════════════════════════════════════════════════════
   TRANSMITTAL BUILDER — Wired Frontend
   API: /api/parse-index, /api/render, /api/email,
        /api/scan-projects, /api/scan-folder, /api/render-to-folder
   ═══════════════════════════════════════════════════════════════ */

// Module-level URL; updated asynchronously via initBackendUrl() on mount.
// All fetch callbacks read this variable at call time, so they always use
// the current value (which will be the sidecar port in production).
let API = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

// Detect Tauri desktop environment
const isTauri = typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__);

// Open a native folder-picker dialog (desktop only).
// Returns the selected path string or null.
async function pickFolder() {
  if (!isTauri) return null;
  try {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const result = await open({ directory: true, multiple: false });
    return result || null;
  } catch {
    return null;
  }
}

// ─── Icons ───────────────────────────────────────────────────
const I={
  plus:<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="8" y1="3" x2="8" y2="13"/><line x1="3" y1="8" x2="13" y2="8"/></svg>,
  x:<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="3" x2="11" y2="11"/><line x1="11" y1="3" x2="3" y2="11"/></svg>,
  check:<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3,7 6,10 11,4"/></svg>,
  send:<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="14" y1="2" x2="7" y2="9"/><polygon points="14,2 10,14 7,9 2,6"/></svg>,
  download:<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M8 2v8m0 0l-3-3m3 3l3-3M3 12h10"/></svg>,
  upload:<svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M11 16V5m0 0L7 9.5M11 5l4 4.5M3 15v2.5A2.5 2.5 0 005.5 20h11a2.5 2.5 0 002.5-2.5V15"/></svg>,
  save:<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M11.5 13H2.5a1 1 0 01-1-1V2a1 1 0 011-1h7l3 3v8a1 1 0 01-1 1z"/><rect x="4" y="8" width="6" height="4" rx="0.5"/><rect x="4" y="1" width="4" height="3" rx="0.5"/></svg>,
  load:<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 5v7a1 1 0 001 1h8a1 1 0 001-1V5"/><path d="M4 3l3-2 3 2"/><line x1="7" y1="1" x2="7" y2="9"/></svg>,
  trash:<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 4h10M5 4V2.5a.5.5 0 01.5-.5h3a.5.5 0 01.5.5V4m1.5 0l-.5 8a1 1 0 01-1 1h-5a1 1 0 01-1-1l-.5-8"/></svg>,
  zap:<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><polygon points="9,1 3,9 8,9 7,15 13,7 8,7"/></svg>,
  grid:<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="2" width="5" height="5" rx="0.5"/><rect x="11" y="2" width="5" height="5" rx="0.5"/><rect x="2" y="11" width="5" height="5" rx="0.5"/><rect x="11" y="11" width="5" height="5" rx="0.5"/></svg>,
  book:<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 11V2.5A1.5 1.5 0 013.5 1H12v10H3.5A1.5 1.5 0 002 12.5 1.5 1.5 0 003.5 14H12"/></svg>,
  pdf:<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><path d="M8.5 1H3.5A1.5 1.5 0 002 2.5v9A1.5 1.5 0 003.5 13h7a1.5 1.5 0 001.5-1.5V4.5L8.5 1z"/><polyline points="8.5,1 8.5,4.5 12,4.5"/></svg>,
  xl:<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1.5" y="1" width="11" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><text x="7" y="9.5" textAnchor="middle" fill="currentColor" fontSize="5" fontWeight="700" fontFamily="sans-serif">XL</text></svg>,
  doc:<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1.5" y="1" width="11" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><text x="7" y="9.5" textAnchor="middle" fill="currentColor" fontSize="4.5" fontWeight="700" fontFamily="sans-serif">DOC</text></svg>,
  spin:<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{animation:"_spin 0.8s linear infinite",transformOrigin:"8px 8px",display:"block"}}><path d="M8 2a6 6 0 105.3 3.2"/></svg>,
  folder:<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 4.5A1.5 1.5 0 013.5 3h3l1.5 1.5H13A1.5 1.5 0 0114.5 6v5.5A1.5 1.5 0 0113 13H3A1.5 1.5 0 011.5 11.5v-7z"/></svg>,
  search:<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="6" cy="6" r="4"/><line x1="9.5" y1="9.5" x2="13" y2="13"/></svg>,
  warn:<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M7 1.5L13 12H1L7 1.5z"/><line x1="7" y1="6" x2="7" y2="9"/><circle cx="7" cy="10.5" r="0.6" fill="currentColor" stroke="none"/></svg>,
};

// ─── Tokens ──────────────────────────────────────────────────
// Warmed/darkened palette to align with the splash screen's brown fade-in
// (#0a0806 → #1a1210). The previous tokens (#1C1B19 / #252420 / …) read as
// neutral grey on launch, which made the transition from splash → app jarring.
// The new values keep the same lightness hierarchy but shift the whole scale
// warmer and ~3 shades darker.
const T={
  bg:"#15110E",bgEl:"#1E1916",bgCard:"#241D18",bgIn:"#2A2218",bgHov:"#2F2620",
  bd:"#3A2D22",bdFoc:"#C8823A",bdSub:"#2A2218",
  t1:"#F0ECE4",t2:"#A39E93",t3:"#736E64",tOn:"#15110E",
  acc:"#C8823A",accH:"#D89248",accM:"rgba(200,130,58,0.15)",accB:"rgba(200,130,58,0.3)",
  ok:"#6B9E6B",okBg:"rgba(107,158,107,0.12)",warn:"#C4A24D",warnBg:"rgba(196,162,77,0.12)",
  err:"#B85C5C",errBg:"rgba(184,92,92,0.12)",info:"#5C8EB8",infoBg:"rgba(92,142,184,0.12)",
  fB:"'DM Sans',system-ui,sans-serif",fM:"'JetBrains Mono','SF Mono',monospace",fD:"'Instrument Serif',Georgia,serif",
  r:"6px",rS:"4px",rL:"10px",
};

const CSS=`
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{background:${T.bg};color:${T.t1};font-family:${T.fB};font-size:14px;line-height:1.5;-webkit-font-smoothing:antialiased;position:relative;min-height:100vh}
/* Forge ambience overlay — mirrors the splash/loader hatch + vignette so the
   hand-off from the loader to the main app reads as one continuous surface. */
body::before{content:'';position:fixed;inset:0;pointer-events:none;z-index:0;background-image:repeating-linear-gradient(-45deg,rgba(200,130,58,0.025) 0px,rgba(200,130,58,0.025) 1px,transparent 1px,transparent 8px)}
body::after{content:'';position:fixed;inset:0;pointer-events:none;z-index:0;background:radial-gradient(ellipse at center,transparent 40%,rgba(0,0,0,0.45) 100%)}
#root{position:relative;z-index:1}
::selection{background:${T.acc};color:${T.tOn}}
input,select,textarea{font-family:inherit;font-size:inherit}
::-webkit-scrollbar{width:6px;height:6px}::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:${T.bd};border-radius:3px}
@keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
.fade-in{animation:fadeIn 0.2s ease}
@keyframes slideDown{from{transform:translateY(-20px);opacity:0}to{transform:translateY(0);opacity:1}}
.toast-slide-down{animation:slideDown 0.25s ease forwards}
@keyframes progressShrink{from{width:100%}to{width:0%}}
@keyframes _spin{to{transform:rotate(360deg)}}
/* Loader-style amber shimmer used on the Sidebar readiness bar. Mirrors
   the .updater-progress-fill animation in updater.css. */
@keyframes _readinessShimmer{0%{left:-60%;opacity:0}10%{opacity:1}80%{opacity:1}100%{left:110%;opacity:0}}
.readiness-fill{position:relative;overflow:hidden;background:linear-gradient(90deg,${T.acc} 0%,#ffcc66 50%,${T.acc} 100%)}
.readiness-fill::after{content:'';position:absolute;top:0;left:-60%;width:60%;height:100%;background:linear-gradient(90deg,transparent 0%,rgba(168,216,255,0.45) 50%,transparent 100%);animation:_readinessShimmer 2s ease-in-out infinite}
@media (prefers-reduced-motion: reduce){.readiness-fill::after{animation:none}}
`;

/** Strip any leading "XMTL"/"xmtl" prefix (with optional dash/underscore/
 *  space and Unicode dash variants) from a transmittal number. Iterative
 *  to handle "XMTL-XMTL-001" without using a nested quantifier (mirror of
 *  backend `_normalize_xmtl_num` in core/render.py). */
const _XMTL_PREFIX=/^xmtl[-_\s\u2013\u2014]*/i;
const stripXmtlPrefix=raw=>{
  let s=String(raw??"").trim();
  while(true){
    const next=s.replace(_XMTL_PREFIX,"").trim();
    if(next===s)return s;
    s=next;
  }
};
const formatXmtlLabel=raw=>{const v=stripXmtlPrefix(raw);return v?`XMTL-${v}`:"XMTL-???";};

let _id=0;const uid=()=>`_${++_id}_${Date.now()}`;

// ─── Filename Parsing (mirrors backend core/render.py) ───────
const DOC_ID_RE=/(?:R3P[-–—]\d+[-–—]E\d+[-–—]\d+)/i;
function extractDocMeta(filename){
  const base=filename.replace(/\.[^.]+$/,"").replace(/^.*[/\\]/,"");
  const m=DOC_ID_RE.exec(base);
  if(!m){return{doc_no:"",desc:base.trim(),rev:""};}
  const rawDoc=m[0];
  const docNo=rawDoc.replace(/[–—]/g,"-").toUpperCase().replace(/^R3P-\d+-/,"");
  const remainder=base.slice(m.index+m[0].length).replace(/^[\s\-_–—:;|]+/,"");
  return{doc_no:docNo,desc:remainder.trim(),rev:""};
}
/** Stable key for dedup / sync between PDF list and doc index rows. */
const docKey=(docNo,desc)=>(docNo+"|"+desc).toLowerCase();

// ─── Status screen (shared layout for checking / failed) ─────
const statusScreenStyle={
  display:"flex",
  flexDirection:"column",
  alignItems:"center",
  justifyContent:"center",
  gap:"12px",
  minHeight:"100vh",
  padding:"24px",
  background:T.bg,
  color:T.t1,
  fontFamily:T.fB,
  textAlign:"center",
};

// ─── Primitives ──────────────────────────────────────────────
const SL=({children,mono,sub})=><div style={{marginBottom:sub?"6px":"14px"}}><span style={{fontSize:sub?"10px":"11px",fontWeight:600,fontFamily:mono?T.fM:T.fB,letterSpacing:"0.12em",fontVariant:"small-caps",textTransform:"uppercase",color:sub?T.t3:T.acc}}>{children}</span></div>;

const labelToName=label=>label?label.toLowerCase().replace(/\s+/g,"_"):undefined;

const TF=({label,value,onChange,placeholder,mono,compact,autoComplete})=>{
  const id=useId();
  return <div style={{flex:1,minWidth:0}}>
    {label&&<label htmlFor={id} style={{display:"block",fontSize:"12px",fontWeight:500,color:T.t2,marginBottom:"3px"}}>{label}</label>}
    <input id={id} name={labelToName(label)} type="text" value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
      autoComplete={autoComplete??"off"}
      style={{width:"100%",padding:compact?"5px 10px":"7px 12px",background:T.bgIn,border:`1px solid ${T.bd}`,borderRadius:T.rS,color:T.t1,fontFamily:mono?T.fM:T.fB,fontSize:mono?"13px":"14px",outline:"none",transition:"border-color 0.15s"}}
      onFocus={e=>{e.target.style.borderColor=T.bdFoc}} onBlur={e=>{e.target.style.borderColor=T.bd}}/>
  </div>;
};

const CB=({label,checked,onChange})=>{
  const id=useId();
  return <label htmlFor={id} style={{display:"flex",alignItems:"center",gap:"8px",cursor:"pointer",padding:"3px 0",fontSize:"13px",color:checked?T.t1:T.t2}}>
    <input id={id} name={labelToName(label)} type="checkbox" checked={checked} onChange={onChange} style={{position:"absolute",opacity:0,width:0,height:0,margin:0}}/>
    <span style={{width:"15px",height:"15px",borderRadius:"3px",border:`1.5px solid ${checked?T.acc:T.bd}`,background:checked?T.acc:"transparent",display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.15s",flexShrink:0}}>{checked&&<span style={{color:T.tOn}}>{I.check}</span>}</span>{label}
  </label>;
};

const Card=({children,style})=><div style={{background:T.bgCard,border:`1px solid ${T.bd}`,borderRadius:T.rL,padding:"24px",...style}}>{children}</div>;

const Badge=({children,color="accent"})=>{const m={accent:{bg:T.accM,t:T.acc,b:T.accB},success:{bg:T.okBg,t:T.ok,b:"rgba(107,158,107,0.3)"},warning:{bg:T.warnBg,t:T.warn,b:"rgba(196,162,77,0.3)"},error:{bg:T.errBg,t:T.err,b:"rgba(184,92,92,0.3)"},info:{bg:T.infoBg,t:T.info,b:"rgba(92,142,184,0.3)"},muted:{bg:T.bgIn,t:T.t3,b:T.bdSub}}[color]||{};
  return <span style={{display:"inline-flex",padding:"2px 8px",fontSize:"11px",fontWeight:600,fontFamily:T.fM,letterSpacing:"0.03em",borderRadius:"4px",background:m.bg,color:m.t,border:`1px solid ${m.b}`}}>{children}</span>;};

const Btn=({children,variant="primary",icon,onClick,disabled,style:s})=>{const[h,setH]=useState(false);
  const v={primary:{bg:h&&!disabled?T.accH:T.acc,color:T.tOn,border:"none",fw:600},secondary:{bg:h&&!disabled?T.bgHov:T.bgIn,color:T.t1,border:`1px solid ${T.bd}`,fw:500},ghost:{bg:h&&!disabled?T.bgHov:"transparent",color:T.t2,border:"1px solid transparent",fw:500}}[variant]||{};
  return <button onClick={onClick} disabled={disabled} onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}
    style={{display:"inline-flex",alignItems:"center",gap:"6px",padding:"7px 14px",borderRadius:T.r,fontSize:"13px",cursor:disabled?"not-allowed":"pointer",opacity:disabled?0.5:1,transition:"all 0.15s",whiteSpace:"nowrap",background:v.bg,color:v.color,border:v.border,fontWeight:v.fw,fontFamily:T.fB,...s}}>
    {icon&&<span style={{display:"flex"}}>{icon}</span>}{children}</button>;};

const Divider=()=><div style={{height:"1px",background:T.bd,margin:"18px 0"}}/>;
const Row=({children,gap="12px"})=>{const c=Array.isArray(children)?children.filter(Boolean).length:1;return <div style={{display:"grid",gridTemplateColumns:`repeat(${c},1fr)`,gap}}>{children}</div>;};

// ─── Toast / Status Bar ──────────────────────────────────────
function Toast({message,type,onDismiss,duration}){
  if(!message)return null;
  const iconMap={success:"✓",error:"⚠",info:"ℹ"};
  const c={
    success:{bg:"#1a3a1a",t:"#7fd87f",b:"rgba(107,158,107,0.45)"},
    error:{bg:"#3a1515",t:"#e87070",b:"rgba(184,92,92,0.45)"},
    loading:{bg:"#2d2010",t:T.acc,b:T.accB},
    info:{bg:"#152030",t:"#70a8e8",b:"rgba(92,142,184,0.45)"},
  }[type]||{bg:T.bgCard,t:T.t1,b:T.bd};
  const showProgress=type!=="loading"&&duration>0;
  return <div style={{position:"fixed",top:"70px",left:"50%",transform:"translateX(-50%)",zIndex:9999,minWidth:"320px",maxWidth:"640px",width:"calc(100% - 64px)"}}>
    <div className="toast-slide-down" style={{borderRadius:T.r,background:c.bg,border:`1px solid ${c.b}`,color:c.t,boxShadow:"0 8px 32px rgba(0,0,0,0.6)",overflow:"hidden"}}>
      <div style={{display:"flex",alignItems:"center",gap:"10px",padding:"14px 20px",fontSize:"14px",fontWeight:500}}>
        <span style={{fontSize:"16px",flexShrink:0,lineHeight:1,display:"flex",alignItems:"center"}}>
          {type==="loading"?I.spin:(iconMap[type]||"ℹ")}
        </span>
        <span style={{flex:1}}>{message}</span>
        {type!=="loading"&&<button onClick={onDismiss} style={{background:"none",border:"none",color:c.t,cursor:"pointer",padding:"0 0 0 8px",display:"flex",flexShrink:0,opacity:0.7}} onMouseEnter={e=>e.currentTarget.style.opacity="1"} onMouseLeave={e=>e.currentTarget.style.opacity="0.7"}>{I.x}</button>}
      </div>
      {showProgress&&<div style={{height:"3px",background:c.t,opacity:0.5,animation:`progressShrink ${duration}ms linear forwards`}}/>}
    </div>
  </div>;
}

// ─── Confirm Dialog ──────────────────────────────────────────
function ConfirmDialog({open,title,message,onConfirm,onCancel,confirmLabel,cancelLabel}){
  if(!open)return null;
  return <div style={{position:"fixed",inset:0,zIndex:10000,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.6)",backdropFilter:"blur(4px)"}}>
    <div style={{background:T.bgCard,border:`1px solid ${T.bd}`,borderRadius:T.rL,padding:"28px 32px",maxWidth:"420px",width:"calc(100% - 48px)",boxShadow:"0 16px 48px rgba(0,0,0,0.5)"}}>
      <div style={{fontSize:"16px",fontWeight:600,color:T.t1,marginBottom:"10px"}}>{title}</div>
      <div style={{fontSize:"13px",color:T.t2,lineHeight:1.6,marginBottom:"20px"}}>{message}</div>
      <div style={{display:"flex",justifyContent:"flex-end",gap:"8px"}}>
        <Btn variant="secondary" onClick={onCancel}>{cancelLabel||"No, Cancel"}</Btn>
        <Btn variant="primary" onClick={onConfirm}>{confirmLabel||"Yes, Continue"}</Btn>
      </div>
    </div>
  </div>;
}

// ─── File Chip ───────────────────────────────────────────────
function FileChip({name,type,onRemove}){
  const c={xl:{bg:T.okBg,t:T.ok,b:"rgba(107,158,107,0.3)",icon:I.xl,label:"INDEX"},doc:{bg:T.infoBg,t:T.info,b:"rgba(92,142,184,0.3)",icon:I.doc,label:"TEMPLATE"},pdf:{bg:"rgba(147,112,219,0.12)",t:"#9370DB",b:"rgba(147,112,219,0.3)",icon:I.pdf,label:"PDF"}}[type]||{};
  return <div style={{display:"inline-flex",alignItems:"center",gap:"6px",padding:"5px 10px 5px 8px",borderRadius:T.rS,background:c.bg,border:`1px solid ${c.b}`}}>
    <span style={{display:"flex",color:c.t}}>{c.icon}</span>
    <span style={{fontSize:"9px",fontWeight:700,fontFamily:T.fM,color:c.t,letterSpacing:"0.06em"}}>{c.label}</span>
    <span style={{fontSize:"12px",color:T.t1,fontFamily:T.fM,maxWidth:"160px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{name}</span>
    <button onClick={onRemove} style={{background:"none",border:"none",color:c.t,cursor:"pointer",padding:"0 0 0 2px",display:"flex",opacity:0.6}}
      onMouseEnter={e=>{e.currentTarget.style.opacity="1"}} onMouseLeave={e=>{e.currentTarget.style.opacity="0.6"}}>{I.x}</button>
  </div>;
}

// ─── Project Search Panel ─────────────────────────────────────
function ProjectSearchPanel({onProjectSelect,showToast}){
  const[root,setRoot]=useState(()=>{
    try{return localStorage.getItem("tb_projects_root")||""}catch{return ""}
  });
  const[query,setQuery]=useState("");
  const[results,setResults]=useState([]);
  const[searching,setSearching]=useState(false);
  const[open,setOpen]=useState(false);
  const[selectedPath,setSelectedPath]=useState(null);
  const debounceRef=useRef(null);
  const panelRef=useRef(null);
  // Tracks whether the search input is currently focused. We only auto-open
  // the results panel when the user is actively engaging with the field —
  // otherwise the dropdown would pop up on first launch as soon as the saved
  // projects root is restored from localStorage and the debounced search runs.
  const searchFocusedRef=useRef(false);
  const rootId=useId();
  const searchId=useId();

  const saveRoot=v=>{
    setRoot(v);
    try{localStorage.setItem("tb_projects_root",v)}catch{}
  };

  const handleBrowse=async()=>{
    const picked=await pickFolder();
    if(picked)saveRoot(picked);
  };

  const doSearch=useCallback(async(r,q)=>{
    if(!r)return;
    setSearching(true);
    try{
      const url=new URL(`${API}/api/scan-projects`);
      url.searchParams.set("root",r);
      if(q)url.searchParams.set("query",q);
      const res=await fetch(url);
      const data=await res.json();
      if(!res.ok)throw new Error(data.detail||"Search failed");
      setResults(data.projects||[]);
      // Only surface the dropdown if the user is actually engaging with the
      // search field; otherwise we silently cache the results so the panel
      // is instant the moment they focus it.
      if(searchFocusedRef.current)setOpen(true);
    }catch(e){
      showToast(`Project search failed: ${e.message}`,"error",5000);
    }finally{setSearching(false)}
  },[]);

  useEffect(()=>{
    clearTimeout(debounceRef.current);
    if(!root){setResults([]);setOpen(false);return}
    debounceRef.current=setTimeout(()=>doSearch(root,query),300);
    return()=>clearTimeout(debounceRef.current);
  },[root,query,doSearch]);

  // Close dropdown on outside click
  useEffect(()=>{
    const handler=e=>{if(panelRef.current&&!panelRef.current.contains(e.target))setOpen(false)};
    document.addEventListener("mousedown",handler);
    return()=>document.removeEventListener("mousedown",handler);
  },[]);

  const handleSelect=async(project)=>{
    setOpen(false);
    setSelectedPath(project.path);
    setQuery(project.job_num+(project.client_site?` — ${project.client_site}`:""));
    onProjectSelect(project);
  };

  const clearSelection=()=>{
    setSelectedPath(null);
    setQuery("");
    setResults([]);
    onProjectSelect(null);
  };

  if(!isTauri){
    return <Card style={{padding:"14px 20px",borderColor:T.bdSub}}>
      <div style={{fontSize:"12px",color:T.t3,display:"flex",alignItems:"center",gap:"6px"}}>
        <span style={{display:"flex",color:T.t3}}>{I.folder}</span>
        Project folder search is only available in the desktop app.
      </div>
    </Card>;
  }

  return <div ref={panelRef}><Card style={{padding:"16px 20px"}}>
    <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"12px"}}>
      <span style={{display:"flex",color:T.acc}}>{I.folder}</span>
      <span style={{fontSize:"12px",fontWeight:600,color:T.t2,textTransform:"uppercase",letterSpacing:"0.06em"}}>Project Folder</span>
      {selectedPath&&<Badge color="success">Active</Badge>}
      {selectedPath&&<Btn variant="ghost" onClick={clearSelection} style={{marginLeft:"auto",padding:"3px 8px",fontSize:"11px"}}>Clear</Btn>}
    </div>

    {/* Projects Root row */}
    <div style={{display:"flex",gap:"6px",marginBottom:"10px",alignItems:"center"}}>
      <div style={{flex:1,position:"relative"}}>
        <label htmlFor={rootId} style={{position:"absolute",width:"1px",height:"1px",padding:0,margin:"-1px",overflow:"hidden",clip:"rect(0,0,0,0)",whiteSpace:"nowrap",border:0}}>Projects root directory</label>
        <input id={rootId} value={root} onChange={e=>saveRoot(e.target.value)} placeholder="Projects root directory (e.g. C:\Projects)"
          name="projects_root" aria-label="Projects root directory"
          style={{width:"100%",padding:"6px 10px",background:T.bgIn,border:`1px solid ${T.bd}`,borderRadius:T.rS,color:T.t1,fontFamily:T.fM,fontSize:"12px",outline:"none",transition:"border-color 0.15s"}}
          onFocus={e=>{e.target.style.borderColor=T.bdFoc}} onBlur={e=>{e.target.style.borderColor=T.bd}}/>
      </div>
      <Btn variant="secondary" icon={I.folder} onClick={handleBrowse} style={{padding:"5px 10px",fontSize:"12px",flexShrink:0}}>Browse</Btn>
    </div>

    {/* Search input + dropdown */}
    {root&&<div style={{position:"relative"}}>
      <div style={{position:"relative",display:"flex",alignItems:"center"}}>
        <span style={{position:"absolute",left:"10px",color:T.t3,display:"flex",pointerEvents:"none"}}>{searching?I.spin:I.search}</span>
        <label htmlFor={searchId} style={{position:"absolute",width:"1px",height:"1px",padding:0,margin:"-1px",overflow:"hidden",clip:"rect(0,0,0,0)",whiteSpace:"nowrap",border:0}}>Search projects</label>
        <input id={searchId} value={query} onChange={e=>setQuery(e.target.value)}
          name="project_search" aria-label="Search projects by name or job number"
          onFocus={e=>{searchFocusedRef.current=true;if(results.length>0||root)setOpen(true);e.target.style.borderColor=T.bdFoc}}
          onBlur={e=>{searchFocusedRef.current=false;e.target.style.borderColor=T.bd}}
          placeholder="Search projects by name, job number..."
          style={{width:"100%",padding:"6px 10px 6px 32px",background:T.bgIn,border:`1px solid ${T.bd}`,borderRadius:T.rS,color:T.t1,fontFamily:T.fB,fontSize:"13px",outline:"none",transition:"border-color 0.15s"}}/>
        {query&&<button onClick={()=>setQuery("")} style={{position:"absolute",right:"8px",background:"none",border:"none",color:T.t3,cursor:"pointer",display:"flex",padding:"2px"}}>{I.x}</button>}
      </div>

      {open&&results.length>0&&<div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:200,marginTop:"4px",background:T.bgCard,border:`1px solid ${T.bd}`,borderRadius:T.r,boxShadow:"0 8px 32px rgba(0,0,0,0.4)",maxHeight:"280px",overflowY:"auto"}}>
        {results.map(p=><button key={p.path} onClick={()=>handleSelect(p)}
          style={{display:"flex",flexDirection:"column",width:"100%",padding:"10px 14px",background:"none",border:"none",borderBottom:`1px solid ${T.bdSub}`,textAlign:"left",cursor:"pointer",transition:"background 0.15s"}}
          onMouseEnter={e=>{e.currentTarget.style.background=T.bgHov}} onMouseLeave={e=>{e.currentTarget.style.background="none"}}>
          <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"4px"}}>
            <span style={{fontFamily:T.fM,fontSize:"12px",fontWeight:600,color:T.acc}}>{p.job_num}</span>
            {p.client_site&&<span style={{fontSize:"12px",color:T.t1}}>{p.client_site}</span>}
            {p.existing_xmtl.length>0&&<span style={{marginLeft:"auto",fontSize:"11px",fontFamily:T.fM,color:T.t3}}>
              XMTL-{p.existing_xmtl[p.existing_xmtl.length-1]?.replace("XMTL-","")} → <span style={{color:T.acc}}>next: {p.next_xmtl_num}</span>
            </span>}
          </div>
          <div style={{display:"flex",gap:"5px",flexWrap:"wrap"}}>
            {p.has_drawings&&<Badge color="success">PDFs</Badge>}
            {p.has_index&&<Badge color="info">Index</Badge>}
            {p.has_template&&<Badge color="info">Template</Badge>}
            {p.has_contacts&&<Badge color="accent">Contacts</Badge>}
          </div>
        </button>)}
      </div>}
      {open&&results.length===0&&!searching&&root&&query&&
        <div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:200,marginTop:"4px",padding:"12px 14px",background:T.bgCard,border:`1px solid ${T.bd}`,borderRadius:T.r,fontSize:"12px",color:T.t3}}>
          No projects found matching "{query}"
        </div>}
    </div>}

    {selectedPath&&<div style={{marginTop:"10px",padding:"8px 10px",background:T.bgEl,borderRadius:T.rS,border:`1px solid ${T.bdSub}`,fontSize:"11px",fontFamily:T.fM,color:T.t3,wordBreak:"break-all"}}>
      {selectedPath}
    </div>}
  </Card></div>;
}

// ─── Sections ────────────────────────────────────────────────
function ProjectSection({draft,u,nextXmtlNum,projectFolderPath,onNextXmtl}){
  const xmtlId=useId();
  return <Card>
  <SL>Project Information</SL>
  <Row><TF label="Job Number" value={draft.jobNum} onChange={v=>u("jobNum",v)} placeholder="XXXX" mono/>
    <div style={{flex:1,minWidth:0}}>
      <label htmlFor={xmtlId} style={{display:"block",fontSize:"12px",fontWeight:500,color:T.t2,marginBottom:"3px"}}>Transmittal No.</label>
      <div style={{display:"flex",alignItems:"center",gap:"6px"}}>
        <input id={xmtlId} name="xmtl_num" type="text" value={draft.xmtlNum} onChange={e=>u("xmtlNum",e.target.value)} placeholder="XMTL-001"
          autoComplete="off"
          style={{width:"100%",padding:"7px 12px",background:T.bgIn,border:`1px solid ${T.bd}`,borderRadius:T.rS,color:T.t1,fontFamily:T.fM,fontSize:"13px",outline:"none",transition:"border-color 0.15s"}}
          onFocus={e=>{e.target.style.borderColor=T.bdFoc}} onBlur={e=>{e.target.style.borderColor=T.bd}}/>
        {projectFolderPath&&nextXmtlNum&&draft.xmtlNum!==nextXmtlNum&&<button onClick={onNextXmtl} title={`Jump to next available: ${nextXmtlNum}`}
          style={{flexShrink:0,padding:"4px 8px",fontSize:"10px",fontFamily:T.fM,fontWeight:600,background:T.accM,color:T.acc,border:`1px solid ${T.accB}`,borderRadius:T.rS,cursor:"pointer",whiteSpace:"nowrap"}}>
          Next: {nextXmtlNum}
        </button>}
      </div>
      {projectFolderPath&&<div style={{fontSize:"10px",color:T.t3,marginTop:"3px"}}>Edit to overwrite an existing transmittal</div>}
    </div>
  </Row>
  <div style={{marginTop:"12px"}}><TF label="Client / Site Name" value={draft.client} onChange={v=>u("client",v)} placeholder="Client Name — Site Name"/></div>
  <div style={{marginTop:"12px"}}><TF label="Project Description" value={draft.projectDesc} onChange={v=>u("projectDesc",v)} placeholder="Enter project description"/></div>
  <div style={{marginTop:"12px",maxWidth:"200px"}}><TF label="Date" value={draft.date} onChange={v=>u("date",v)} placeholder="MM/DD/YYYY" mono/></div>
  <Divider/>
  <SL>Sender</SL>
  <Row><TF label="Name" value={draft.fromName} onChange={v=>u("fromName",v)} placeholder="Full name" autoComplete="name"/><TF label="Title" value={draft.fromTitle} onChange={v=>u("fromTitle",v)} placeholder="Title / Role" autoComplete="organization-title"/></Row>
  <div style={{marginTop:"12px"}}><Row><TF label="Email" value={draft.fromEmail} onChange={v=>u("fromEmail",v)} placeholder="email@company.com" autoComplete="email"/><TF label="Phone" value={draft.fromPhone} onChange={v=>u("fromPhone",v)} placeholder="(XXX) XXX-XXXX" mono autoComplete="tel"/></Row></div>
  <div style={{marginTop:"12px",maxWidth:"240px"}}><TF label="Firm Registration" value={draft.firm} onChange={v=>u("firm",v)} placeholder="TX FIRM #XXXXX" mono autoComplete="organization"/></div>
</Card>;}

function OptionsSection({checks,toggle,showToast}){
  const G=[{label:"Transmitted",keys:[["trans_pdf","PDF"],["trans_cad","CAD"],["trans_originals","Originals"]]},{label:"Sent Via",keys:[["via_email","Email"],["via_ftp","FTP"]]},
    {label:"Copy Intent",keys:[["ci_info","For Information Only"],["ci_approval","For Approval"],["ci_bid","For Bid"],["ci_preliminary","For Preliminary"],["ci_const","For Construction"],["ci_asbuilt","For As-Built"],["ci_fab","For Fabrication"],["ci_record","For Record"],["ci_ref","For Reference"]]},
    {label:"Vendor Response",keys:[["vr_approved","Approved"],["vr_approved_noted","Approved as Noted"],["vr_rejected","Rejected"]]}];
  const ciKeys=["ci_info","ci_approval","ci_bid","ci_preliminary","ci_const","ci_asbuilt","ci_fab","ci_record","ci_ref"];
  const handleToggle=(k)=>{
    // Enforce single copy-intent selection
    if(ciKeys.includes(k)&&!checks[k]){
      const alreadySelected=ciKeys.filter(c=>checks[c]);
      if(alreadySelected.length>0){
        showToast("Only 1 copy intent can be selected","error",4000);
        return;
      }
    }
    toggle(k);
  };
  return <Card><SL>Transmittal Options</SL><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"20px"}}>{G.map(g=><div key={g.label}><SL sub mono>{g.label}</SL>{g.keys.map(([k,l])=><CB key={k} label={l} checked={checks[k]} onChange={()=>handleToggle(k)}/>)}</div>)}</div></Card>;
}

function ContactsSection({contacts,updateContact,removeContact,addContact,savedLists,onLoadList,onDeleteList}){
  const[showBook,setShowBook]=useState(false);
  return <Card>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"14px"}}>
      <SL>Contacts</SL>
      <div style={{display:"flex",gap:"6px"}}>
        <Btn variant="ghost" icon={I.book} onClick={()=>setShowBook(!showBook)}>Address Book{savedLists.length>0&&<span style={{marginLeft:"4px"}}><Badge color="muted">{savedLists.length}</Badge></span>}</Btn>
        <Btn variant="ghost" icon={I.plus} onClick={addContact}>Add</Btn>
      </div>
    </div>
    {showBook&&<div style={{marginBottom:"16px",padding:"14px",background:T.bgEl,borderRadius:T.r,border:`1px solid ${T.bdSub}`}}>
      <SL sub mono>Saved Contact Lists</SL>
      {savedLists.length===0?<div style={{fontSize:"12px",color:T.t3,marginBottom:"10px",fontStyle:"italic"}}>No saved contact lists yet. Add contacts manually or import from a project folder.</div>:
        <div style={{display:"flex",flexDirection:"column",gap:"6px",marginBottom:"10px"}}>{savedLists.map(sl=><div key={sl.name} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"6px 10px",background:T.bgIn,borderRadius:T.rS,border:`1px solid ${T.bdSub}`}}>
          <div style={{display:"flex",alignItems:"center",gap:"8px"}}><span style={{fontSize:"13px",fontWeight:500,color:T.t1}}>{sl.name}</span><Badge color="muted">{sl.contacts.length}</Badge></div>
          <div style={{display:"flex",gap:"4px"}}><Btn variant="ghost" icon={I.load} onClick={()=>onLoadList(sl.name)} style={{padding:"4px 8px",fontSize:"11px"}}>Import</Btn><button onClick={()=>onDeleteList(sl.name)} style={{background:"none",border:"none",color:T.t3,cursor:"pointer",padding:"4px",display:"flex"}}>{I.trash}</button></div>
        </div>)}</div>}
      <div style={{fontSize:"11px",color:T.t3}}>Import contacts from a previously used transmittal list</div>
    </div>}
    {contacts.length===0?<div style={{padding:"24px",textAlign:"center",color:T.t3,fontSize:"13px",border:`1px dashed ${T.bd}`,borderRadius:T.r}}>No contacts added — contacts auto-load from project folder, or add manually</div>:
      <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>{contacts.map((c,i)=><div key={c.id} style={{padding:"10px 12px",background:T.bgEl,borderRadius:T.r,border:`1px solid ${T.bdSub}`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"6px"}}><span style={{fontSize:"10px",fontFamily:T.fM,color:T.t3}}>CONTACT {String(i+1).padStart(2,"0")}</span><button onClick={()=>removeContact(c.id)} style={{background:"none",border:"none",color:T.t3,cursor:"pointer",padding:"2px",display:"flex"}}>{I.x}</button></div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px"}}><TF compact label="Name" value={c.name} onChange={v=>updateContact(c.id,"name",v)} placeholder="Name"/><TF compact label="Company" value={c.company} onChange={v=>updateContact(c.id,"company",v)} placeholder="Company"/><TF compact label="Email" value={c.email} onChange={v=>updateContact(c.id,"email",v)} placeholder="Email"/><TF compact label="Phone" value={c.phone} onChange={v=>updateContact(c.id,"phone",v)} placeholder="Phone" mono/></div>
      </div>)}</div>}
  </Card>;
}

// ─── Documents Section ───────────────────────────────────────
const thS={fontSize:"10px",fontWeight:600,fontFamily:T.fM,letterSpacing:"0.08em",textTransform:"uppercase",color:T.t3};
const cMono={background:"transparent",border:"none",color:T.t1,fontFamily:T.fM,fontSize:"13px",padding:"4px 0",outline:"none",width:"100%"};
const cBody={background:"transparent",border:"none",color:T.t1,fontSize:"13px",padding:"4px 0",outline:"none",width:"100%"};

function DocumentsSection({documents,updateDoc,removeDoc,addDoc,clearAll,templateFile,indexFile,pdfFiles,onFileDrop,clearTemplate,clearIndex,removePdf,indexLoading,indexWarnings}){
  const inputRef=useRef(null);const[over,setOver]=useState(false);const prevent=e=>{e.preventDefault();e.stopPropagation()};
  const hasAnything=documents.length>0||pdfFiles.length>0||indexFile;
  return <Card>
    <SL>Documents</SL>
    <div onDragOver={e=>{prevent(e);setOver(true)}} onDragLeave={e=>{prevent(e);setOver(false)}}
      onDrop={e=>{prevent(e);setOver(false);onFileDrop([...e.dataTransfer.files])}} onClick={()=>inputRef.current?.click()}
      style={{padding:"28px 20px",border:`1.5px dashed ${over?T.acc:T.bd}`,borderRadius:T.r,textAlign:"center",cursor:"pointer",transition:"all 0.2s",background:over?T.accM:"transparent",marginBottom:"16px"}}>
      <input ref={inputRef} type="file" multiple accept=".pdf,.xlsx,.xls,.docx" name="document_files" style={{display:"none"}} onChange={e=>{onFileDrop([...e.target.files]);e.target.value=""}}/>
      <div style={{color:over?T.acc:T.t3,marginBottom:"6px",display:"flex",justifyContent:"center"}}>{indexLoading?I.spin:I.upload}</div>
      <div style={{fontSize:"14px",color:T.t1,fontWeight:500,marginBottom:"4px"}}>{indexLoading?"Reading drawing index...":"Click to browse or drag and drop your files here"}</div>
      <div style={{fontSize:"12px",color:T.t3,lineHeight:1.7}}><span style={{color:T.t2}}>PDFs</span> → source documents · <span style={{color:T.ok}}>Excel</span> → revision lookup (read-only) · <span style={{color:T.info}}>DOCX</span> → template</div>
    </div>
    {(templateFile||indexFile||pdfFiles.length>0)&&<div style={{display:"flex",flexWrap:"wrap",gap:"8px",marginBottom:"16px"}}>
      {templateFile&&<FileChip name={templateFile.name} type="doc" onRemove={clearTemplate}/>}
      {indexFile&&<FileChip name={indexFile.name} type="xl" onRemove={clearIndex}/>}
      {pdfFiles.map(f=><FileChip key={f.name} name={f.name} type="pdf" onRemove={()=>removePdf(f.name)}/>)}
    </div>}
    {indexWarnings&&indexWarnings.length>0&&<div style={{marginBottom:"12px",padding:"8px 12px",borderRadius:T.rS,background:T.warnBg,border:`1px solid rgba(196,162,77,0.3)`,fontSize:"12px",color:T.warn}}>{indexWarnings.join(" · ")}</div>}
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"8px"}}>
      <SL sub mono>Document Index{documents.length>0&&<span style={{color:T.t3,fontWeight:400}}> · {documents.length} item{documents.length!==1?"s":""}</span>}</SL>
      <div style={{display:"flex",gap:"6px"}}>
        {hasAnything&&<Btn variant="ghost" icon={I.trash} onClick={clearAll} style={{padding:"4px 10px",fontSize:"12px",color:T.err}}>Clear All</Btn>}
        <Btn variant="ghost" icon={I.plus} onClick={addDoc} style={{padding:"4px 10px",fontSize:"12px"}}>Add Row</Btn>
      </div>
    </div>
    {documents.length===0?<div style={{padding:"24px",textAlign:"center",color:T.t3,fontSize:"13px",border:`1px solid ${T.bd}`,borderRadius:T.r,background:T.bgEl}}>Drop PDFs above to auto-populate, use "Add Row" for manual entries, or drop an Excel drawing index to apply revisions to the rows below</div>:
      <><div style={{display:"grid",gridTemplateColumns:"160px 1fr 70px 36px",gap:"8px",padding:"7px 12px",background:T.bgEl,borderRadius:`${T.rS} ${T.rS} 0 0`,borderBottom:`1px solid ${T.bd}`}}><span style={thS}>Doc No.</span><span style={thS}>Description</span><span style={thS}>Rev</span><span/></div>
      <div style={{border:`1px solid ${T.bd}`,borderTop:"none",borderRadius:`0 0 ${T.rS} ${T.rS}`,overflow:"hidden"}}>{documents.map((d,i)=><div key={d.id} style={{display:"grid",gridTemplateColumns:"160px 1fr 70px 36px",gap:"8px",padding:"5px 12px",alignItems:"center",borderBottom:i<documents.length-1?`1px solid ${T.bdSub}`:"none",background:i%2===0?"transparent":"rgba(255,255,255,0.008)"}}>
        <input value={d.docNo} onChange={e=>updateDoc(d.id,"docNo",e.target.value)} name={`doc_no_${i}`} aria-label={`Document number for row ${i+1}`} placeholder="E0-001" autoComplete="off" style={cMono}/>
        <input value={d.desc} onChange={e=>updateDoc(d.id,"desc",e.target.value)} name={`doc_desc_${i}`} aria-label={`Description for row ${i+1}`} placeholder="Description" autoComplete="off" style={cBody}/>
        <input value={d.rev} onChange={e=>updateDoc(d.id,"rev",e.target.value)} name={`doc_rev_${i}`} aria-label={`Revision for row ${i+1}`} placeholder="—" autoComplete="off" style={{...cMono,color:T.acc,fontWeight:500,textAlign:"center"}}/>
        <button onClick={()=>removeDoc(d.id)} style={{background:"none",border:"none",color:T.t3,cursor:"pointer",padding:"4px",display:"flex",justifyContent:"center",opacity:0.4,transition:"opacity 0.15s"}} onMouseEnter={e=>{e.currentTarget.style.opacity="1"}} onMouseLeave={e=>{e.currentTarget.style.opacity="0.4"}}>{I.x}</button>
      </div>)}</div></>}
  </Card>;
}

// ─── Sidebar ─────────────────────────────────────────────────
function Sidebar({draft,checks,contacts,documents,pdfFiles,templateFile,indexFile,onGenerate,onEmail,generating,projectFolderPath,nextXmtlNum}){
  const filled=[draft.jobNum,draft.xmtlNum,draft.client,draft.projectDesc,draft.fromName,draft.date,draft.fromTitle,draft.fromEmail,draft.fromPhone,draft.firm].filter(Boolean).length;
  const total=10;const activeChecks=Object.values(checks).filter(Boolean).length;const goodContacts=contacts.filter(c=>c.name&&c.email).length;
  const hasT=!!templateFile,hasI=!!indexFile,hasP=pdfFiles.length>0;
  const totalPdfCount=pdfFiles.length;
  // Per-group option checks (each group counts once regardless of how many selected within it).
  // Vendor Response is intentionally tracked but excluded from the readiness %
  // and the "Option groups" tally below — it's hardly used in practice and was
  // forcing the meter to plateau at 95% on every transmittal.
  const hasTransmitted=checks.trans_pdf||checks.trans_cad||checks.trans_originals;
  const hasSentVia=checks.via_email||checks.via_ftp;
  const hasCopyIntent=checks.ci_info||checks.ci_approval||checks.ci_bid||checks.ci_preliminary||checks.ci_const||checks.ci_asbuilt||checks.ci_fab||checks.ci_record||checks.ci_ref;
  const optionGroupsFilled=[hasTransmitted,hasSentVia,hasCopyIntent].filter(Boolean).length;
  // Granular readiness: each field contributes individually.
  // PDFs are optional and don't reduce readiness when absent.
  // Vendor Response group is excluded — its 5% has been redistributed to
  // template (+3) and docRows (+2) so the total still sums to 100.
  let pct=0;
  if(draft.jobNum)pct+=7;         // Job Number
  if(draft.xmtlNum)pct+=7;       // Transmittal No.
  if(draft.client)pct+=5;         // Client/Site
  if(draft.projectDesc)pct+=5;    // Project Description
  if(draft.fromName)pct+=4;       // Sender Name
  if(draft.date)pct+=4;           // Date
  if(draft.fromTitle)pct+=2;      // Sender Title
  if(draft.fromEmail)pct+=3;      // Sender Email
  if(draft.fromPhone)pct+=2;      // Sender Phone
  if(draft.firm)pct+=2;           // Firm Registration
  if(hasT)pct+=17;                // Template loaded (was 14, +3 from VR redistribution)
  if(goodContacts>0)pct+=9;       // Contacts
  if(hasTransmitted)pct+=8;       // Transmitted group (at least 1)
  if(hasSentVia)pct+=5;           // Sent Via group (at least 1)
  if(hasCopyIntent)pct+=8;        // Copy Intent group (at least 1)
  if(documents.length>0)pct+=8;   // Document index rows (was 6, +2 from VR redistribution)
  if(hasI)pct+=4;                 // Drawing index (optional but counts)
  pct=Math.min(100,pct);
  const canGenerate=hasT&&documents.length>0&&filled>=4&&!generating;
  const folderMode=!!projectFolderPath;

  return <div style={{display:"flex",flexDirection:"column",gap:"14px"}}>
    <Card style={{padding:"18px"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:"10px"}}><span style={{fontSize:"12px",fontWeight:600,color:T.t2,fontVariant:"small-caps",letterSpacing:"0.08em"}}>Readiness</span><span style={{fontSize:"20px",fontWeight:600,fontFamily:T.fM,color:pct>=100?T.ok:T.acc}}>{pct}%</span></div>
      <div style={{height:"6px",background:T.bgIn,borderRadius:"3px",overflow:"hidden",border:`1px solid ${T.bdSub}`}}><div className={pct>=100?"":"readiness-fill"} style={{height:"100%",width:`${pct}%`,background:pct>=100?T.ok:undefined,borderRadius:"3px",transition:"width 0.4s ease"}}/></div></Card>

    <Card style={{padding:"18px"}}><SL sub mono>Package Summary</SL><div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
      {[{l:"Project fields",v:`${filled} / ${total}`,ok:filled===total},{l:"Template",v:hasT?"loaded":"missing",ok:hasT},{l:"Drawing index",v:hasI?"loaded":"missing",ok:hasI},{l:"Source PDFs",v:totalPdfCount||"optional",ok:hasP,optional:true},{l:"Option groups",v:`${optionGroupsFilled} / 3`,ok:optionGroupsFilled===3},{l:"Contacts",v:goodContacts,ok:goodContacts>0},{l:"Doc index rows",v:documents.length,ok:documents.length>0}].map(x=>
        <div key={x.l} style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{fontSize:"12px",color:T.t2}}>{x.l}</span><Badge color={x.ok?"success":(x.optional?"info":"muted")}>{String(x.v)}</Badge></div>)}</div></Card>

    <Card style={{padding:"18px"}}><SL sub mono>Package Output</SL>
      {folderMode?<div style={{display:"flex",flexDirection:"column",gap:"6px"}}>
        <div style={{display:"flex",alignItems:"center",gap:"6px"}}><span style={{color:T.ok,display:"flex"}}>{I.folder}</span><span style={{fontSize:"12px",fontWeight:600,color:T.ok}}>Folder Mode</span></div>
        <div style={{fontSize:"11px",fontFamily:T.fM,color:T.t3,wordBreak:"break-all",marginBottom:"4px"}}>{projectFolderPath}</div>
        <Badge color="success">{formatXmtlLabel(draft.xmtlNum)}</Badge>
        <div style={{display:"flex",flexDirection:"column",gap:"4px",marginTop:"4px"}}>
          <Badge color="info">Transmittal DOCX</Badge>
          <Badge color="info">Transmittal PDF</Badge>
          {hasP&&<Badge color="info">Combined PDF</Badge>}
          <Badge color="accent">Contacts</Badge>
        </div>
      </div>:<div style={{fontSize:"13px",color:T.t2,lineHeight:1.6}}>Includes:
        <div style={{display:"flex",flexDirection:"column",gap:"6px",marginTop:"8px"}}>
          <Badge color="info">Transmittal DOCX</Badge>
          <Badge color="info">Transmittal PDF</Badge>
          {hasP&&<Badge color="info">Combined PDF</Badge>}
        </div>
        <div style={{fontSize:"11px",color:T.t3,marginTop:"8px"}}>Select a project above for folder output</div>
      </div>}
    </Card>

    <Card style={{padding:"18px"}}>
      <Btn variant="primary" icon={generating?I.spin:I.zap} onClick={onGenerate} disabled={!canGenerate}
        style={{width:"100%",justifyContent:"center",padding:"10px 16px",fontSize:"14px"}}>
        {generating?"Generating...":(folderMode?"Save to Project Folder":"Generate Transmittal Package")}
      </Btn>
      {!canGenerate&&!generating&&(<div style={{fontSize:"11px",color:T.t3,textAlign:"center",marginTop:"6px"}}>
        {!hasT?"Upload a template":""}
        {hasT&&documents.length===0?"Upload a drawing index":""}
        {hasT&&documents.length>0&&filled<4?"Fill required fields":""}
      </div>)}
      <Btn variant="secondary" icon={I.send} onClick={onEmail} style={{width:"100%",justifyContent:"center",marginTop:"8px"}}>Email</Btn>
    </Card>
  </div>;
}

// ─── Header ──────────────────────────────────────────────────
// Mirrors the splash/loader treatment: wordmark in small-caps with the
// "Engineered to Deliver" tagline beneath in amber. The gradient logo
// square was retired from the loader, so we drop it here too. The right
// side of the bar is intentionally empty — the previous "Tools" button
// was a no-op and is removed pending a real menu.
function Header(){return <header style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 32px",borderBottom:`1px solid ${T.bd}`,background:T.bgEl}}>
  <div style={{display:"flex",flexDirection:"column",lineHeight:1.15}}>
    <div style={{fontFamily:T.fB,fontSize:"15px",fontWeight:600,color:T.t1,fontVariant:"small-caps",letterSpacing:"0.12em"}}>Transmittal Builder</div>
    <div style={{fontFamily:T.fM,fontSize:"10px",color:T.acc,letterSpacing:"0.18em",textTransform:"uppercase",marginTop:"2px"}}>Engineered to Deliver</div>
  </div>
</header>;}

// ─── Main App ────────────────────────────────────────────────
const defaultDraft={jobNum:"",xmtlNum:"",client:"",projectDesc:"",date:new Date().toLocaleDateString("en-US"),fromName:"",fromTitle:"",fromEmail:"",fromPhone:"",firm:""};
const defaultChecks={trans_pdf:false,trans_cad:false,trans_originals:false,via_email:false,via_ftp:false,ci_info:false,ci_approval:false,ci_bid:false,ci_preliminary:false,ci_const:false,ci_asbuilt:false,ci_fab:false,ci_record:false,ci_ref:false,vr_approved:false,vr_approved_noted:false,vr_rejected:false};

export default function App(){
  const[draft,setDraft]=useState(defaultDraft);
  const[checks,setChecks]=useState(defaultChecks);
  const[contacts,setContacts]=useState([]);
  const[documents,setDocuments]=useState([]);
  const[templateFile,setTemplateFile]=useState(null);   // File object
  const[indexFile,setIndexFile]=useState(null);          // File object
  const[pdfFiles,setPdfFiles]=useState([]);              // File objects
  const[savedLists,setSavedLists]=useState([]);
  const[indexLoading,setIndexLoading]=useState(false);
  const[indexWarnings,setIndexWarnings]=useState([]);
  const[generating,setGenerating]=useState(false);
  const[toast,setToast]=useState(null); // {message,type}
  const[backendStatus,setBackendStatus]=useState("checking"); // checking | ready | failed

  // ─── Project folder mode state ───────────────────────────
  const[projectFolderPath,setProjectFolderPath]=useState(null); // absolute path (transmittals folder)
  const[nextXmtlNum,setNextXmtlNum]=useState(null);             // e.g. "003"
  const[projectRoot,setProjectRoot]=useState(null);             // project root folder name for breadcrumb
  const[confirmDialog,setConfirmDialog]=useState(null);       // {title,message,onConfirm} or null

  // ─── Auto-updater state ────────────────────────────────────
  // updateInfo: { version, installerPath, notes } | null
  const[updateInfo,setUpdateInfo]=useState(null);

  // Check for updates on mount (Tauri only). Errors degrade silently.
  useEffect(()=>{
    if(!isTauri)return;
    import("@tauri-apps/api/core").then(({invoke})=>{
      invoke("check_for_update").then(result=>{
        if(result?.updateAvailable){
          setUpdateInfo(result);
        }
      }).catch(e=>{
        console.warn("[updater] check_for_update failed:",e);
      });
    }).catch(()=>{});
  },[]);

  const handleInstallUpdate=useCallback(()=>{
    if(!isTauri)return;
    import("@tauri-apps/api/core").then(({invoke})=>{
      invoke("start_update").catch(e=>{
        console.error("[updater] start_update failed:",e);
      });
    }).catch(()=>{});
  },[]);

  const showToast=(message,type="info",duration=5000)=>{setToast({message,type,duration:type!=="loading"?duration:0});if(type!=="loading")setTimeout(()=>setToast(null),duration);};

  // Load saved contacts
  useEffect(()=>{try{const v=localStorage.getItem("tb_contact_lists");if(v)setSavedLists(JSON.parse(v))}catch(e){}},[]);
  const persistLists=useCallback(l=>{setSavedLists(l);try{localStorage.setItem("tb_contact_lists",JSON.stringify(l))}catch(e){}},[]);

  const u=useCallback((k,v)=>setDraft(p=>({...p,[k]:v})),[]);

  // ─── Project folder selection handler ────────────────────
  const handleProjectSelect=useCallback(async(selectedProject)=>{
    if(!selectedProject){
      setProjectFolderPath(null);
      setNextXmtlNum(null);
      setProjectRoot(null);
      return;
    }

    showToast("Scanning project folder...","loading");

    const applyProjectData=(outputDir,jobNum,clientSite,xmtlNum,root)=>{
      setProjectFolderPath(outputDir);
      setNextXmtlNum(xmtlNum);
      setProjectRoot(root||null);
      u("jobNum",jobNum);
      u("client",clientSite);
      u("xmtlNum",xmtlNum);
    };

    try{
      const res=await fetch(`${API}/api/scan-folder`,{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({folder_path:selectedProject.path}),
      });
      const data=await res.json();
      if(!res.ok)throw new Error(data.detail||"Scan failed");

      const outputDir=data.output_dir||selectedProject.path;
      const rootName=data.project_root?data.project_root.split(/[/\\]/).pop():null;
      applyProjectData(outputDir,data.job_num||"",data.client_site||"",data.next_xmtl_num||"001",rootName);

      // Auto-load contacts from project (contacts.json found by backend)
      if(data.contacts&&data.contacts.length>0){
        setContacts(data.contacts.map(c=>({...c,id:uid()})));
      }

      showToast(`Project loaded — XMTL-${data.next_xmtl_num} ready`,"success",4000);
    }catch(e){
      showToast(`Project scan failed: ${e.message}`,"error",6000);
      applyProjectData(selectedProject.path,selectedProject.job_num||"",selectedProject.client_site||"",selectedProject.next_xmtl_num||"001",null);
    }
  },[u]);
  const toggle=useCallback(k=>setChecks(p=>({...p,[k]:!p[k]})),[]);
  const addContact=useCallback(()=>setContacts(p=>[...p,{id:uid(),name:"",company:"",email:"",phone:""}]),[]);
  const updateContact=useCallback((id,f,v)=>setContacts(p=>p.map(c=>c.id===id?{...c,[f]:v}:c)),[]);
  const removeContact=useCallback(id=>setContacts(p=>p.filter(c=>c.id!==id)),[]);
  const addDoc=useCallback(()=>setDocuments(p=>[...p,{id:uid(),docNo:"",desc:"",rev:""}]),[]);
  const updateDoc=useCallback((id,f,v)=>setDocuments(p=>p.map(d=>d.id===id?{...d,[f]:v}:d)),[]);
  const removeDoc=useCallback(id=>setDocuments(p=>p.filter(d=>d.id!==id)),[]);

  // ─── Parse Excel via API ─────────────────────────────────
  // The drawing index is now a *revision lookup only* — parsing it never
  // adds, removes, or replaces document rows. Rows come exclusively from
  // PDFs (drag-drop or "Add Row"). We just merge in the `rev` column for
  // any existing row whose docKey matches a row in the index.
  const parseIndex=useCallback(async(file)=>{
    setIndexLoading(true);setIndexWarnings([]);
    try{
      const form=new FormData();
      form.append("file",file);
      const res=await fetch(`${API}/api/parse-index`,{method:"POST",body:form});
      const data=await res.json();
      if(!res.ok)throw new Error(data.detail||"Parse failed");
      if(data.warnings?.length)setIndexWarnings(data.warnings);

      // Build a docKey → rev map from the parsed index.
      const revMap=new Map();
      for(const d of (data.documents||[])){
        const key=docKey(d.doc_no,d.desc);
        if(key)revMap.set(key,d.rev||"");
      }

      // Merge revisions into existing rows; never add or remove rows.
      let matched=0;
      setDocuments(prev=>prev.map(d=>{
        const key=docKey(d.docNo,d.desc);
        if(revMap.has(key)){
          matched++;
          return{...d,rev:revMap.get(key)||d.rev};
        }
        return d;
      }));

      showToast(
        matched>0
          ?`Revisions applied to ${matched} of ${data.row_count} index rows`
          :`Index loaded — no matching PDF rows yet (revisions will apply once PDFs are added)`,
        "success"
      );
    }catch(e){
      showToast(`Index parse failed: ${e.message}`,"error");
    }finally{setIndexLoading(false)}
  },[]);

  // ─── Smart file router ───────────────────────────────────
  const onFileDrop=useCallback(files=>{
    const newPdfs=[];
    for(const f of files){
      const ext=f.name.split(".").pop().toLowerCase();
      if(ext==="docx"){
        setTemplateFile(f);
        showToast(`Template loaded: ${f.name}`,"success",3000);
      }else if(ext==="xlsx"||ext==="xls"){
        setIndexFile(f);
        parseIndex(f);
      }else if(ext==="pdf"){
        setPdfFiles(prev=>{
          if(prev.some(p=>p.name===f.name))return prev;
          return[...prev,f];
        });
        newPdfs.push(f);
      }
    }
    // Auto-create document index rows for new PDFs
    if(newPdfs.length>0){
      setDocuments(prev=>{
        const existing=new Set(prev.map(d=>docKey(d.docNo,d.desc)));
        const toAdd=[];
        for(const f of newPdfs){
          const meta=extractDocMeta(f.name);
          const key=docKey(meta.doc_no,meta.desc);
          if(!existing.has(key)){
            toAdd.push({id:uid(),docNo:meta.doc_no,desc:meta.desc,rev:meta.rev,_pdfName:f.name});
            existing.add(key);
          }
        }
        return[...prev,...toAdd];
      });
    }
  },[parseIndex]);

  const clearTemplate=useCallback(()=>setTemplateFile(null),[]);
  // Clearing the index file no longer wipes document rows — the rows are
  // owned by the PDF list, not the index. Existing `rev` values are kept.
  const clearIndex=useCallback(()=>{setIndexFile(null);setIndexWarnings([])},[]);
  const removePdf=useCallback(name=>{
    setPdfFiles(p=>p.filter(f=>f.name!==name));
    // Sync-remove matching document row
    const meta=extractDocMeta(name);
    const key=docKey(meta.doc_no,meta.desc);
    setDocuments(p=>p.filter(d=>docKey(d.docNo,d.desc)!==key));
  },[]);
  const clearAllDocuments=useCallback(()=>{
    setDocuments([]);setPdfFiles([]);setIndexFile(null);setIndexWarnings([]);
    showToast("All documents and PDFs cleared","info",3000);
  },[]);

  // ─── Generate Transmittal ────────────────────────────────
  const doGenerate=useCallback(async()=>{
    if(!templateFile||documents.length===0)return;
    setGenerating(true);

    const fieldsPayload={
      date:draft.date,job_num:draft.jobNum,transmittal_num:draft.xmtlNum,
      client:draft.client,project_desc:draft.projectDesc,
      from_name:draft.fromName,from_title:draft.fromTitle,
      from_email:draft.fromEmail,from_phone:draft.fromPhone,firm:draft.firm,
    };
    const contactsClean=contacts.filter(c=>c.name||c.email).map(({name,company,email,phone})=>({name,company,email,phone}));

    // ── Folder output mode ─────────────────────────────────
    if(projectFolderPath){
      showToast("Writing to project folder...","loading");
      try{
        const form=new FormData();
        form.append("template",templateFile);
        form.append("fields",JSON.stringify(fieldsPayload));
        form.append("checks",JSON.stringify(checks));
        form.append("contacts",JSON.stringify(contactsClean));
        form.append("documents",JSON.stringify(documents.map(d=>({doc_no:d.docNo,desc:d.desc,rev:d.rev}))));
        form.append("output_dir",projectFolderPath);
        for(const pdf of pdfFiles){form.append("pdfs",pdf)}

        const res=await fetch(`${API}/api/render-to-folder`,{method:"POST",body:form});
        if(!res.ok){const err=await res.json().catch(()=>({}));throw new Error(err.detail||`Server error ${res.status}`);}

        const data=await res.json();
        const folderName=data.xmtl_folder_name||"XMTL folder";
        showToast(`✓ Saved to ${folderName} in project folder`,"success",8000);
        // Update next available number but keep current XMTL number (user can change manually)
        if(data.next_xmtl_num)setNextXmtlNum(data.next_xmtl_num);
      }catch(e){
        showToast(`Folder output failed: ${e.message}`,"error",8000);
      }finally{setGenerating(false)}
      return;
    }

    // ── ZIP download mode (original workflow) ──────────────
    showToast("Generating transmittal package...","loading");
    try{
      const form=new FormData();
      form.append("template",templateFile);
      form.append("fields",JSON.stringify(fieldsPayload));
      form.append("checks",JSON.stringify(checks));
      form.append("contacts",JSON.stringify(contactsClean));
      form.append("documents",JSON.stringify(documents.map(d=>({doc_no:d.docNo,desc:d.desc,rev:d.rev}))));
      for(const pdf of pdfFiles){form.append("pdfs",pdf)}

      const res=await fetch(`${API}/api/render`,{method:"POST",body:form});
      if(!res.ok){const err=await res.json().catch(()=>({}));throw new Error(err.detail||`Server error ${res.status}`);}

      const blob=await res.blob();
      const filename=`R3P-${draft.jobNum||"XXXX"}-XMTL-${draft.xmtlNum||"001"}-Package.zip`;
      const url=URL.createObjectURL(blob);
      const a=document.createElement("a");
      a.href=url;
      a.download=filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showToast(`Transmittal package generated: ${filename}`,"success");
    }catch(e){
      showToast(`Generation failed: ${e.message}`,"error",8000);
    }finally{setGenerating(false)}
  },[templateFile,documents,draft,checks,contacts,pdfFiles,projectFolderPath]);

  // ─── Generate with overwrite check ───────────────────────
  const handleGenerate=useCallback(()=>{
    // Check if XMTL number is lower than next available (would overwrite)
    if(projectFolderPath&&nextXmtlNum&&draft.xmtlNum){
      const current=parseInt(draft.xmtlNum,10);
      const next=parseInt(nextXmtlNum,10);
      if(!isNaN(current)&&!isNaN(next)&&current<next){
        setConfirmDialog({
          title:"Overwrite Existing Transmittal?",
          message:`XMTL-${String(current).padStart(3,"0")} already exists in the project folder. Generating will overwrite the existing files. Do you want to continue?`,
          confirmLabel:"Yes, Overwrite",
          onConfirm:()=>{setConfirmDialog(null);doGenerate()},
        });
        return;
      }
    }
    doGenerate();
  },[doGenerate,projectFolderPath,nextXmtlNum,draft.xmtlNum]);

  // ─── Next XMTL number with fresh session prompt ─────────
  const handleNextXmtl=useCallback(()=>{
    if(!nextXmtlNum)return;
    setConfirmDialog({
      title:"Start Fresh Session?",
      message:`You're moving to XMTL-${nextXmtlNum}. Would you like to clear the current form data and start fresh, or keep your existing data?`,
      confirmLabel:"Start Fresh",
      cancelLabel:"Keep Data & Update",
      onConfirm:()=>{
        setConfirmDialog(null);
        u("xmtlNum",nextXmtlNum);
        setDocuments([]);
        setPdfFiles([]);
        setIndexFile(null);
        setChecks({...defaultChecks});
        setIndexWarnings([]);
        showToast(`Starting fresh for XMTL-${nextXmtlNum}`,"success",3000);
      },
      onCancel:()=>{
        setConfirmDialog(null);
        u("xmtlNum",nextXmtlNum);
        showToast(`Updated to XMTL-${nextXmtlNum}`,"success",3000);
      },
    });
  },[nextXmtlNum,u]);

  // ─── Email (placeholder) ─────────────────────────────────
  const handleEmail=useCallback(()=>{
    showToast("Email integration: configure SMTP in backend .env to enable","info",5000);
  },[]);

  // ─── Contact list persistence ────────────────────────────
  const onLoadList=useCallback(name=>{const list=savedLists.find(l=>l.name===name);if(list){setContacts(list.contacts.map(c=>({...c,id:uid()})));showToast(`Imported "${name}" contacts`,"success",3000)}},[savedLists]);
  const onDeleteList=useCallback(name=>{persistLists(savedLists.filter(l=>l.name!==name));showToast(`Deleted "${name}"`,"info",3000)},[savedLists,persistLists]);

 // ─── Check backend status on load ─────────────────────────
  useEffect(()=>{
    let cancelled=false;

    const waitForBackend=async()=>{
      const maxAttempts=40;
      const delayMs=500;

      for(let attempt=1;attempt<=maxAttempts;attempt++){
        try {
          API = await refreshBackendUrl();
        } catch {}

        try{
          const res=await fetch(`${API}/api/health`);
          if(!res.ok)throw new Error(`Health check failed with ${res.status}`);
          if(!cancelled)setBackendStatus("ready");
          return;
        }catch(error){
          if(attempt===maxAttempts){
            if(!cancelled)setBackendStatus("failed");
            return;
          }
          await new Promise(resolve=>setTimeout(resolve,delayMs));
        }
      }
    };

    waitForBackend();
    return()=>{cancelled=true};
  },[]);

  // ─── Checking state ──────────────────────────────────────
  if(backendStatus==="checking"){
    return <>
      <style>{CSS}</style>
      <div style={statusScreenStyle}>
        <div style={{color:T.acc,display:"flex"}}>{I.spin}</div>
        <div style={{fontSize:"14px",fontWeight:500}}>Starting local services...</div>
        <div style={{fontSize:"12px",color:T.t3}}>Please wait while the backend becomes available...</div>
      </div>
    </>;
  }

  // ─── Failed state ────────────────────────────────────────
  if(backendStatus==="failed"){
    return <>
      <style>{CSS}</style>
      <div style={statusScreenStyle}>
        <div style={{fontSize:"16px",fontWeight:600,color:T.err}}>Backend Unavailable</div>
        <div style={{fontSize:"12px",color:T.t3,maxWidth:"480px",lineHeight:1.7}}>
          The Python backend at <span style={{fontFamily:T.fM,color:T.t2}}>{new URL(API).host}</span> could not be reached.
          <br/><br/>
          <strong style={{color:T.t2}}>Desktop mode:</strong> Check the terminal for backend startup errors.
          Make sure Python and <span style={{fontFamily:T.fM}}>uvicorn</span> are installed in the active environment.
          <br/><br/>
          <strong style={{color:T.t2}}>Web mode:</strong> Start the backend manually:<br/>
          <code style={{fontFamily:T.fM,fontSize:"11px",color:T.acc}}>cd backend && uvicorn app:app --port 8000</code>
        </div>
        <Btn variant="secondary" onClick={()=>window.location.reload()} style={{marginTop:"6px"}}>
          Retry
        </Btn>
      </div>
    </>;
  }

  // ─── Ready state (main app) ──────────────────────────────
  return <>
    <style>{CSS}</style>
    <div style={{display:"flex",flexDirection:"column",minHeight:"100vh"}}>
      <Header/>
      <div style={{display:"flex",alignItems:"center",gap:"8px",padding:"9px 32px",borderBottom:`1px solid ${T.bdSub}`,fontSize:"12px",fontFamily:T.fM,color:T.t3}}>
        <span style={{color:T.t2}}>Draft</span>
        <span style={{opacity:0.4}}>/</span>
        <span>New Transmittal</span>
        {draft.jobNum&&<><span style={{opacity:0.4}}>/</span><span style={{color:T.acc}}>{draft.jobNum}</span></>}
        {projectFolderPath&&<><span style={{opacity:0.4}}>/</span><span style={{color:T.ok}}>Folder Mode</span></>}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 280px",gap:"24px",flex:1,padding:"24px 32px",maxWidth:"1280px",width:"100%",margin:"0 auto"}}>
        <div style={{display:"flex",flexDirection:"column",gap:"18px"}}>
          <ProjectSearchPanel onProjectSelect={handleProjectSelect} showToast={showToast}/>
          <ProjectSection draft={draft} u={u} nextXmtlNum={nextXmtlNum} projectFolderPath={projectFolderPath} onNextXmtl={handleNextXmtl}/>
          <OptionsSection checks={checks} toggle={toggle} showToast={showToast}/>
          <ContactsSection contacts={contacts} updateContact={updateContact} removeContact={removeContact} addContact={addContact} savedLists={savedLists} onLoadList={onLoadList} onDeleteList={onDeleteList}/>
          <DocumentsSection documents={documents} updateDoc={updateDoc} removeDoc={removeDoc} addDoc={addDoc} clearAll={clearAllDocuments} templateFile={templateFile} indexFile={indexFile} pdfFiles={pdfFiles} onFileDrop={onFileDrop} clearTemplate={clearTemplate} clearIndex={clearIndex} removePdf={removePdf} indexLoading={indexLoading} indexWarnings={indexWarnings}/>
        </div>
        <div style={{position:"sticky",top:"24px",alignSelf:"start"}}>
          <Sidebar draft={draft} checks={checks} contacts={contacts} documents={documents} pdfFiles={pdfFiles} templateFile={templateFile} indexFile={indexFile} onGenerate={handleGenerate} onEmail={handleEmail} generating={generating} projectFolderPath={projectFolderPath} nextXmtlNum={nextXmtlNum}/>
        </div>
      </div>
      <footer style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 32px",borderTop:`1px solid ${T.bdSub}`,fontSize:"11px",fontFamily:T.fM,color:T.t3,letterSpacing:"0.04em"}}>
        <span>v{APP_VERSION}</span><span>© 2026 Transmittal Builder</span>
      </footer>
    </div>
    <Toast message={toast?.message} type={toast?.type} onDismiss={()=>setToast(null)} duration={toast?.duration||5000}/>
    <ConfirmDialog open={!!confirmDialog} title={confirmDialog?.title} message={confirmDialog?.message} onConfirm={confirmDialog?.onConfirm} onCancel={confirmDialog?.onCancel||(()=>setConfirmDialog(null))} confirmLabel={confirmDialog?.confirmLabel} cancelLabel={confirmDialog?.cancelLabel}/>
    {updateInfo&&(
      <UpdateModal
        version={updateInfo.version}
        notes={updateInfo.notes}
        onInstall={handleInstallUpdate}
      />
    )}
  </>;
}

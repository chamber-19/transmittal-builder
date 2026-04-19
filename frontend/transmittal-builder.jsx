import { useState, useCallback, useRef, useEffect } from "react";

/* ═══════════════════════════════════════════════════════════════
   TRANSMITTAL BUILDER v3.0 — Wired Frontend (legacy)
   API: /api/parse-index, /api/render, /api/email
   ═══════════════════════════════════════════════════════════════ */

const API = "http://localhost:8000"; // Backend URL

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
  pdf:<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1.5" y="1" width="11" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><text x="7" y="9.5" textAnchor="middle" fill="currentColor" fontSize="5" fontWeight="700" fontFamily="sans-serif">PDF</text></svg>,
  xl:<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1.5" y="1" width="11" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><text x="7" y="9.5" textAnchor="middle" fill="currentColor" fontSize="5" fontWeight="700" fontFamily="sans-serif">XL</text></svg>,
  doc:<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1.5" y="1" width="11" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><text x="7" y="9.5" textAnchor="middle" fill="currentColor" fontSize="4.5" fontWeight="700" fontFamily="sans-serif">DOC</text></svg>,
  spin:<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M8 2a6 6 0 105.3 3.2"><animateTransform attributeName="transform" type="rotate" from="0 8 8" to="360 8 8" dur="0.8s" repeatCount="indefinite"/></path></svg>,
};

// ─── Tokens ──────────────────────────────────────────────────
const T={
  bg:"#1C1B19",bgEl:"#252420",bgCard:"#2C2B27",bgIn:"#33322D",bgHov:"#3A3934",
  bd:"#3E3D38",bdFoc:"#C4884D",bdSub:"#33322D",
  t1:"#F0ECE4",t2:"#A39E93",t3:"#736E64",tOn:"#1C1B19",
  acc:"#C4884D",accH:"#D4994E",accM:"rgba(196,136,77,0.15)",accB:"rgba(196,136,77,0.3)",
  ok:"#6B9E6B",okBg:"rgba(107,158,107,0.12)",warn:"#C4A24D",warnBg:"rgba(196,162,77,0.12)",
  err:"#B85C5C",errBg:"rgba(184,92,92,0.12)",info:"#5C8EB8",infoBg:"rgba(92,142,184,0.12)",
  fB:"'DM Sans',system-ui,sans-serif",fM:"'JetBrains Mono','SF Mono',monospace",fD:"'Instrument Serif',Georgia,serif",
  r:"6px",rS:"4px",rL:"10px",
};

const CSS=`
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{background:${T.bg};color:${T.t1};font-family:${T.fB};font-size:14px;line-height:1.5;-webkit-font-smoothing:antialiased}
::selection{background:${T.acc};color:${T.tOn}}
input,select,textarea{font-family:inherit;font-size:inherit}
::-webkit-scrollbar{width:6px;height:6px}::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:${T.bd};border-radius:3px}
@keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
.fade-in{animation:fadeIn 0.2s ease}
`;

let _id=0;const uid=()=>`_${++_id}_${Date.now()}`;

// ─── Primitives ──────────────────────────────────────────────
const SL=({children,mono,sub})=><div style={{marginBottom:sub?"6px":"14px"}}><span style={{fontSize:sub?"10px":"11px",fontWeight:600,fontFamily:mono?T.fM:T.fB,letterSpacing:"0.08em",textTransform:"uppercase",color:sub?T.t3:T.acc}}>{children}</span></div>;

const TF=({label,value,onChange,placeholder,mono,compact})=><div style={{flex:1,minWidth:0}}>
  {label&&<label style={{display:"block",fontSize:"12px",fontWeight:500,color:T.t2,marginBottom:"3px"}}>{label}</label>}
  <input type="text" value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
    style={{width:"100%",padding:compact?"5px 10px":"7px 12px",background:T.bgIn,border:`1px solid ${T.bd}`,borderRadius:T.rS,color:T.t1,fontFamily:mono?T.fM:T.fB,fontSize:mono?"13px":"14px",outline:"none",transition:"border-color 0.15s"}}
    onFocus={e=>{e.target.style.borderColor=T.bdFoc}} onBlur={e=>{e.target.style.borderColor=T.bd}}/></div>;

const CB=({label,checked,onChange})=><label style={{display:"flex",alignItems:"center",gap:"8px",cursor:"pointer",padding:"3px 0",fontSize:"13px",color:checked?T.t1:T.t2}}>
  <span style={{width:"15px",height:"15px",borderRadius:"3px",border:`1.5px solid ${checked?T.acc:T.bd}`,background:checked?T.acc:"transparent",display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.15s",flexShrink:0}}>{checked&&<span style={{color:T.tOn}}>{I.check}</span>}</span>{label}</label>;

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
function Toast({message,type,onDismiss}){
  if(!message)return null;
  const c={success:{bg:T.okBg,t:T.ok,b:"rgba(107,158,107,0.3)"},error:{bg:T.errBg,t:T.err,b:"rgba(184,92,92,0.3)"},loading:{bg:T.accM,t:T.acc,b:T.accB},info:{bg:T.infoBg,t:T.info,b:"rgba(92,142,184,0.3)"}}[type]||{};
  return <div className="fade-in" style={{position:"fixed",bottom:"24px",right:"24px",padding:"10px 16px",borderRadius:T.r,background:c.bg,border:`1px solid ${c.b}`,color:c.t,fontSize:"13px",fontWeight:500,display:"flex",alignItems:"center",gap:"8px",zIndex:999,maxWidth:"400px",boxShadow:"0 8px 32px rgba(0,0,0,0.4)"}}>
    {type==="loading"&&I.spin}<span>{message}</span>
    {type!=="loading"&&<button onClick={onDismiss} style={{background:"none",border:"none",color:c.t,cursor:"pointer",padding:"0",display:"flex",marginLeft:"8px"}}>{I.x}</button>}
  </div>;
}

// ─── File Chip ───────────────────────────────────────────────
function FileChip({name,type,onRemove}){
  const c={xl:{bg:T.okBg,t:T.ok,b:"rgba(107,158,107,0.3)",icon:I.xl,label:"INDEX"},doc:{bg:T.infoBg,t:T.info,b:"rgba(92,142,184,0.3)",icon:I.doc,label:"TEMPLATE"}}[type]||{};
  return <div style={{display:"inline-flex",alignItems:"center",gap:"6px",padding:"5px 10px 5px 8px",borderRadius:T.rS,background:c.bg,border:`1px solid ${c.b}`}}>
    <span style={{display:"flex",color:c.t}}>{c.icon}</span>
    <span style={{fontSize:"9px",fontWeight:700,fontFamily:T.fM,color:c.t,letterSpacing:"0.06em"}}>{c.label}</span>
    <span style={{fontSize:"12px",color:T.t1,fontFamily:T.fM,maxWidth:"160px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{name}</span>
    <button onClick={onRemove} style={{background:"none",border:"none",color:c.t,cursor:"pointer",padding:"0 0 0 2px",display:"flex",opacity:0.6}}
      onMouseEnter={e=>{e.currentTarget.style.opacity="1"}} onMouseLeave={e=>{e.currentTarget.style.opacity="0.6"}}>{I.x}</button>
  </div>;
}

// ─── Sections ────────────────────────────────────────────────
function ProjectSection({draft,u}){return <Card>
  <SL>Project Information</SL>
  <Row><TF label="Job Number" value={draft.jobNum} onChange={v=>u("jobNum",v)} placeholder="XXXX" mono/><TF label="Transmittal No." value={draft.xmtlNum} onChange={v=>u("xmtlNum",v)} placeholder="XMTL-001" mono/></Row>
  <div style={{marginTop:"12px"}}><TF label="Client / Site Name" value={draft.client} onChange={v=>u("client",v)} placeholder="Client Name — Site Name"/></div>
  <div style={{marginTop:"12px"}}><TF label="Project Description" value={draft.projectDesc} onChange={v=>u("projectDesc",v)} placeholder="Enter project description"/></div>
  <div style={{marginTop:"12px",maxWidth:"200px"}}><TF label="Date" value={draft.date} onChange={v=>u("date",v)} placeholder="MM/DD/YYYY" mono/></div>
  <Divider/>
  <SL>Sender</SL>
  <Row><TF label="Name" value={draft.fromName} onChange={v=>u("fromName",v)} placeholder="Full name"/><TF label="Title" value={draft.fromTitle} onChange={v=>u("fromTitle",v)} placeholder="Title / Role"/></Row>
  <div style={{marginTop:"12px"}}><Row><TF label="Email" value={draft.fromEmail} onChange={v=>u("fromEmail",v)} placeholder="email@company.com"/><TF label="Phone" value={draft.fromPhone} onChange={v=>u("fromPhone",v)} placeholder="(XXX) XXX-XXXX" mono/></Row></div>
  <div style={{marginTop:"12px",maxWidth:"240px"}}><TF label="Firm Registration" value={draft.firm} onChange={v=>u("firm",v)} placeholder="TX FIRM #XXXXX" mono/></div>
</Card>;}

function OptionsSection({checks,toggle}){
  const G=[{label:"Transmitted",keys:[["trans_pdf","PDF"],["trans_cad","CAD"],["trans_originals","Originals"]]},{label:"Sent Via",keys:[["via_email","Email"],["via_ftp","FTP"]]},
    {label:"Copy Intent",keys:[["ci_info","For Information Only"],["ci_approval","For Approval"],["ci_bid","For Bid"],["ci_preliminary","For Preliminary"],["ci_const","For Construction"],["ci_asbuilt","For As-Built"],["ci_fab","For Fabrication"],["ci_record","For Record"],["ci_ref","For Reference"]]},
    {label:"Vendor Response",keys:[["vr_approved","Approved"],["vr_approved_noted","Approved as Noted"],["vr_rejected","Rejected"]]}];
  return <Card><SL>Transmittal Options</SL><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"20px"}}>{G.map(g=><div key={g.label}><SL sub mono>{g.label}</SL>{g.keys.map(([k,l])=><CB key={k} label={l} checked={checks[k]} onChange={()=>toggle(k)}/>)}</div>)}</div></Card>;
}

function ContactsSection({contacts,updateContact,removeContact,addContact,savedLists,onSaveList,onLoadList,onDeleteList}){
  const[showBook,setShowBook]=useState(false);const[listName,setListName]=useState("");
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
      {savedLists.length===0?<div style={{fontSize:"12px",color:T.t3,marginBottom:"10px",fontStyle:"italic"}}>No saved lists yet</div>:
        <div style={{display:"flex",flexDirection:"column",gap:"6px",marginBottom:"10px"}}>{savedLists.map(sl=><div key={sl.name} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"6px 10px",background:T.bgIn,borderRadius:T.rS,border:`1px solid ${T.bdSub}`}}>
          <div style={{display:"flex",alignItems:"center",gap:"8px"}}><span style={{fontSize:"13px",fontWeight:500,color:T.t1}}>{sl.name}</span><Badge color="muted">{sl.contacts.length}</Badge></div>
          <div style={{display:"flex",gap:"4px"}}><Btn variant="ghost" icon={I.load} onClick={()=>onLoadList(sl.name)} style={{padding:"4px 8px",fontSize:"11px"}}>Load</Btn><button onClick={()=>onDeleteList(sl.name)} style={{background:"none",border:"none",color:T.t3,cursor:"pointer",padding:"4px",display:"flex"}}>{I.trash}</button></div>
        </div>)}</div>}
      <div style={{display:"flex",gap:"6px"}}>
        <input value={listName} onChange={e=>setListName(e.target.value)} placeholder="List name..." style={{flex:1,padding:"5px 10px",background:T.bgIn,border:`1px solid ${T.bd}`,borderRadius:T.rS,color:T.t1,fontSize:"13px",outline:"none"}}
          onFocus={e=>{e.target.style.borderColor=T.bdFoc}} onBlur={e=>{e.target.style.borderColor=T.bd}}
          onKeyDown={e=>{if(e.key==="Enter"&&listName.trim()&&contacts.length>0){onSaveList(listName.trim());setListName("")}}}/>
        <Btn variant="secondary" icon={I.save} onClick={()=>{if(listName.trim()){onSaveList(listName.trim());setListName("")}}} disabled={!listName.trim()||contacts.length===0} style={{fontSize:"12px"}}>Save Current</Btn>
      </div>
    </div>}
    {contacts.length===0?<div style={{padding:"24px",textAlign:"center",color:T.t3,fontSize:"13px",border:`1px dashed ${T.bd}`,borderRadius:T.r}}>No contacts added — use the Address Book to load a saved list or add manually</div>:
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

function DocumentsSection({documents,updateDoc,removeDoc,addDoc,templateFile,indexFile,pdfFiles,onFileDrop,clearTemplate,clearIndex,removePdf,indexLoading,indexWarnings}){
  const inputRef=useRef(null);const[over,setOver]=useState(false);const prevent=e=>{e.preventDefault();e.stopPropagation()};
  return <Card>
    <SL>Documents</SL>
    <div onDragOver={e=>{prevent(e);setOver(true)}} onDragLeave={e=>{prevent(e);setOver(false)}}
      onDrop={e=>{prevent(e);setOver(false);onFileDrop([...e.dataTransfer.files])}} onClick={()=>inputRef.current?.click()}
      style={{padding:"28px 20px",border:`1.5px dashed ${over?T.acc:T.bd}`,borderRadius:T.r,textAlign:"center",cursor:"pointer",transition:"all 0.2s",background:over?T.accM:"transparent",marginBottom:"16px"}}>
      <input ref={inputRef} type="file" multiple accept=".pdf,.xlsx,.xls,.docx" style={{display:"none"}} onChange={e=>{onFileDrop([...e.target.files]);e.target.value=""}}/>
      <div style={{color:over?T.acc:T.t3,marginBottom:"6px",display:"flex",justifyContent:"center"}}>{indexLoading?I.spin:I.upload}</div>
      <div style={{fontSize:"14px",color:T.t1,fontWeight:500,marginBottom:"4px"}}>{indexLoading?"Parsing drawing index...":"Drop all your files here"}</div>
      <div style={{fontSize:"12px",color:T.t3,lineHeight:1.7}}><span style={{color:T.t2}}>PDFs</span> → source documents · <span style={{color:T.ok}}>Excel</span> → drawing index & revisions · <span style={{color:T.info}}>DOCX</span> → template</div>
    </div>
    {(templateFile||indexFile||pdfFiles.length>0)&&<div style={{display:"flex",flexWrap:"wrap",gap:"8px",marginBottom:"16px"}}>
      {templateFile&&<FileChip name={templateFile.name} type="doc" onRemove={clearTemplate}/>}
      {indexFile&&<FileChip name={indexFile.name} type="xl" onRemove={clearIndex}/>}
      {pdfFiles.map(f=><div key={f.name} style={{display:"inline-flex",alignItems:"center",gap:"5px",padding:"4px 8px",borderRadius:T.rS,background:T.bgEl,border:`1px solid ${T.bdSub}`,fontSize:"12px",fontFamily:T.fM,color:T.t2}}>
        <span style={{display:"flex",color:T.t3}}>{I.pdf}</span><span style={{maxWidth:"120px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.name}</span>
        <button onClick={()=>removePdf(f.name)} style={{background:"none",border:"none",color:T.t3,cursor:"pointer",padding:"0",display:"flex",opacity:0.5}} onMouseEnter={e=>{e.currentTarget.style.opacity="1"}} onMouseLeave={e=>{e.currentTarget.style.opacity="0.5"}}>{I.x}</button>
      </div>)}
    </div>}
    {indexWarnings&&indexWarnings.length>0&&<div style={{marginBottom:"12px",padding:"8px 12px",borderRadius:T.rS,background:T.warnBg,border:`1px solid rgba(196,162,77,0.3)`,fontSize:"12px",color:T.warn}}>{indexWarnings.join(" · ")}</div>}
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"8px"}}>
      <SL sub mono>Document Index{documents.length>0&&<span style={{color:T.t3,fontWeight:400}}> · {documents.length} item{documents.length!==1?"s":""}</span>}</SL>
      <Btn variant="ghost" icon={I.plus} onClick={addDoc} style={{padding:"4px 10px",fontSize:"12px"}}>Add Row</Btn>
    </div>
    {documents.length===0?<div style={{padding:"24px",textAlign:"center",color:T.t3,fontSize:"13px",border:`1px solid ${T.bd}`,borderRadius:T.r,background:T.bgEl}}>Drop an Excel drawing index above to populate this table automatically</div>:
      <><div style={{display:"grid",gridTemplateColumns:"160px 1fr 70px 36px",gap:"8px",padding:"7px 12px",background:T.bgEl,borderRadius:`${T.rS} ${T.rS} 0 0`,borderBottom:`1px solid ${T.bd}`}}><span style={thS}>Doc No.</span><span style={thS}>Description</span><span style={thS}>Rev</span><span/></div>
      <div style={{border:`1px solid ${T.bd}`,borderTop:"none",borderRadius:`0 0 ${T.rS} ${T.rS}`,overflow:"hidden"}}>{documents.map((d,i)=><div key={d.id} style={{display:"grid",gridTemplateColumns:"160px 1fr 70px 36px",gap:"8px",padding:"5px 12px",alignItems:"center",borderBottom:i<documents.length-1?`1px solid ${T.bdSub}`:"none",background:i%2===0?"transparent":"rgba(255,255,255,0.008)"}}>
        <input value={d.docNo} onChange={e=>updateDoc(d.id,"docNo",e.target.value)} placeholder="E0-001" style={cMono}/>
        <input value={d.desc} onChange={e=>updateDoc(d.id,"desc",e.target.value)} placeholder="Description" style={cBody}/>
        <input value={d.rev} onChange={e=>updateDoc(d.id,"rev",e.target.value)} placeholder="—" style={{...cMono,color:T.acc,fontWeight:500,textAlign:"center"}}/>
        <button onClick={()=>removeDoc(d.id)} style={{background:"none",border:"none",color:T.t3,cursor:"pointer",padding:"4px",display:"flex",justifyContent:"center",opacity:0.4,transition:"opacity 0.15s"}} onMouseEnter={e=>{e.currentTarget.style.opacity="1"}} onMouseLeave={e=>{e.currentTarget.style.opacity="0.4"}}>{I.x}</button>
      </div>)}</div></>}
  </Card>;
}

// ─── Sidebar ─────────────────────────────────────────────────
function Sidebar({draft,checks,contacts,documents,pdfFiles,templateFile,indexFile,outputFormat,setOutputFormat,onGenerate,onEmail,generating}){
  const filled=[draft.jobNum,draft.xmtlNum,draft.client,draft.projectDesc,draft.fromName,draft.date].filter(Boolean).length;
  const total=6;const activeChecks=Object.values(checks).filter(Boolean).length;const goodContacts=contacts.filter(c=>c.name&&c.email).length;
  const hasT=!!templateFile,hasI=!!indexFile,hasP=pdfFiles.length>0;
  const pct=Math.min(100,Math.round((filled/total)*25+(hasT?15:0)+(hasI?15:0)+(hasP?15:0)+(goodContacts>0?15:0)+(activeChecks>0?10:0)+(documents.length>0?5:0)));
  const canGenerate=hasT&&documents.length>0&&filled>=4&&!generating;

  return <div style={{display:"flex",flexDirection:"column",gap:"14px"}}>
    <Card style={{padding:"18px"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:"10px"}}><span style={{fontSize:"12px",fontWeight:600,color:T.t2}}>Readiness</span><span style={{fontSize:"20px",fontWeight:600,fontFamily:T.fM,color:pct>=100?T.ok:T.acc}}>{pct}%</span></div>
      <div style={{height:"4px",background:T.bgIn,borderRadius:"2px",overflow:"hidden"}}><div style={{height:"100%",width:`${pct}%`,background:pct>=100?T.ok:T.acc,borderRadius:"2px",transition:"width 0.4s ease"}}/></div></Card>

    <Card style={{padding:"18px"}}><SL sub mono>Package Summary</SL><div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
      {[{l:"Project fields",v:`${filled} / ${total}`,ok:filled===total},{l:"Template",v:hasT?"loaded":"missing",ok:hasT},{l:"Drawing index",v:hasI?"loaded":"missing",ok:hasI},{l:"Source PDFs",v:pdfFiles.length,ok:hasP},{l:"Options set",v:activeChecks,ok:activeChecks>0},{l:"Contacts",v:goodContacts,ok:goodContacts>0},{l:"Doc index rows",v:documents.length,ok:documents.length>0}].map(x=>
        <div key={x.l} style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{fontSize:"12px",color:T.t2}}>{x.l}</span><Badge color={x.ok?"success":"muted"}>{String(x.v)}</Badge></div>)}</div></Card>

    <Card style={{padding:"18px"}}><SL sub mono>Output</SL>
      {[{v:"combined_pdf",l:"Combined PDF (transmittal + drawings)"},{v:"docx",l:"Word document only (.docx)"},{v:"both",l:"Both (DOCX + combined PDF)"}].map(o=>
        <label key={o.v} style={{display:"flex",alignItems:"center",gap:"8px",padding:"5px 8px",borderRadius:T.rS,cursor:"pointer",fontSize:"13px",color:outputFormat===o.v?T.t1:T.t2,marginBottom:"2px",background:outputFormat===o.v?T.accM:"transparent",border:`1px solid ${outputFormat===o.v?T.accB:"transparent"}`,transition:"all 0.15s"}} onClick={()=>setOutputFormat(o.v)}>
          <span style={{width:"13px",height:"13px",borderRadius:"50%",border:`2px solid ${outputFormat===o.v?T.acc:T.bd}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{outputFormat===o.v&&<span style={{width:"5px",height:"5px",borderRadius:"50%",background:T.acc}}/>}</span>{o.l}</label>)}</Card>

    <Card style={{padding:"18px"}}>
      <Btn variant="primary" icon={generating?I.spin:I.zap} onClick={onGenerate} disabled={!canGenerate}
        style={{width:"100%",justifyContent:"center",padding:"10px 16px",fontSize:"14px"}}>
        {generating?"Generating...":"Generate Transmittal"}
      </Btn>
      {!canGenerate&&!generating&&<div style={{fontSize:"11px",color:T.t3,textAlign:"center",marginTop:"6px"}}>
        {!hasT?"Upload a template":""}
        {hasT&&documents.length===0?"Add documents":""}
        {hasT&&documents.length>0&&filled<4?"Fill required fields":""}
      </div>}
      <div style={{display:"flex",gap:"8px",marginTop:"8px"}}>
        <Btn variant="secondary" icon={I.send} onClick={onEmail} style={{flex:1,justifyContent:"center"}}>Email</Btn>
        <Btn variant="secondary" icon={I.download} onClick={onGenerate} disabled={!canGenerate} style={{flex:1,justifyContent:"center"}}>Export</Btn>
      </div>
    </Card>
  </div>;
}

// ─── Header ──────────────────────────────────────────────────
function Header(){return <header style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 32px",borderBottom:`1px solid ${T.bd}`,background:T.bgEl}}>
  <div style={{display:"flex",alignItems:"center",gap:"14px"}}>
    <div style={{width:"36px",height:"36px",borderRadius:"6px",background:`linear-gradient(135deg,${T.acc},#A06830)`,display:"flex",alignItems:"center",justifyContent:"center",color:T.tOn,fontFamily:T.fM,fontWeight:700,fontSize:"11px",letterSpacing:"-0.02em"}}>TB</div>
    <div><div style={{fontFamily:T.fD,fontSize:"18px",color:T.t1,lineHeight:1.2}}>Transmittal Builder</div></div>
  </div>
  <Btn variant="ghost" icon={I.grid}>Tools</Btn>
</header>;}

// ─── Main App ────────────────────────────────────────────────
const defaultDraft={jobNum:"",xmtlNum:"",client:"",projectDesc:"",date:new Date().toLocaleDateString("en-US"),fromName:"",fromTitle:"",fromEmail:"",fromPhone:"",firm:""};
const defaultChecks={trans_pdf:false,trans_cad:false,trans_originals:false,via_email:false,via_ftp:false,ci_info:false,ci_approval:false,ci_bid:false,ci_preliminary:false,ci_const:false,ci_asbuilt:false,ci_fab:false,ci_record:false,ci_ref:false,vr_approved:false,vr_approved_noted:false,vr_rejected:false};

export default function App(){
  const[draft,setDraft]=useState(defaultDraft);
  const[checks,setChecks]=useState(defaultChecks);
  const[contacts,setContacts]=useState([]);
  const[documents,setDocuments]=useState([]);
  const[outputFormat,setOutputFormat]=useState("combined_pdf");
  const[templateFile,setTemplateFile]=useState(null);   // File object
  const[indexFile,setIndexFile]=useState(null);          // File object
  const[pdfFiles,setPdfFiles]=useState([]);              // File objects
  const[savedLists,setSavedLists]=useState([]);
  const[indexLoading,setIndexLoading]=useState(false);
  const[indexWarnings,setIndexWarnings]=useState([]);
  const[generating,setGenerating]=useState(false);
  const[toast,setToast]=useState(null); // {message,type}

  const showToast=(message,type="info",duration=5000)=>{setToast({message,type});if(type!=="loading")setTimeout(()=>setToast(null),duration);};

  // Load saved contacts
  useEffect(()=>{(async()=>{try{const r=await window.storage.get("tb_contact_lists");if(r)setSavedLists(JSON.parse(r.value))}catch(e){}})()},[]);
  const persistLists=useCallback(async l=>{setSavedLists(l);try{await window.storage.set("tb_contact_lists",JSON.stringify(l))}catch(e){}},[]);

  const u=useCallback((k,v)=>setDraft(p=>({...p,[k]:v})),[]);
  const toggle=useCallback(k=>setChecks(p=>({...p,[k]:!p[k]})),[]);
  const addContact=useCallback(()=>setContacts(p=>[...p,{id:uid(),name:"",company:"",email:"",phone:""}]),[]);
  const updateContact=useCallback((id,f,v)=>setContacts(p=>p.map(c=>c.id===id?{...c,[f]:v}:c)),[]);
  const removeContact=useCallback(id=>setContacts(p=>p.filter(c=>c.id!==id)),[]);
  const addDoc=useCallback(()=>setDocuments(p=>[...p,{id:uid(),docNo:"",desc:"",rev:""}]),[]);
  const updateDoc=useCallback((id,f,v)=>setDocuments(p=>p.map(d=>d.id===id?{...d,[f]:v}:d)),[]);
  const removeDoc=useCallback(id=>setDocuments(p=>p.filter(d=>d.id!==id)),[]);

  // ─── Parse Excel via API ─────────────────────────────────
  const parseIndex=useCallback(async(file)=>{
    setIndexLoading(true);setIndexWarnings([]);
    try{
      const form=new FormData();
      form.append("file",file);
      const res=await fetch(`${API}/api/parse-index`,{method:"POST",body:form});
      const data=await res.json();
      if(!res.ok)throw new Error(data.detail||"Parse failed");
      setDocuments(data.documents.map(d=>({id:uid(),docNo:d.doc_no,desc:d.desc,rev:d.rev})));
      if(data.warnings?.length)setIndexWarnings(data.warnings);
      showToast(`Loaded ${data.row_count} documents from "${data.sheet_name}"`,"success");
    }catch(e){
      showToast(`Index parse error: ${e.message}`,"error");
    }finally{setIndexLoading(false)}
  },[]);

  // ─── Smart file router ───────────────────────────────────
  const onFileDrop=useCallback(files=>{
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
      }
    }
  },[parseIndex]);

  const clearTemplate=useCallback(()=>setTemplateFile(null),[]);
  const clearIndex=useCallback(()=>{setIndexFile(null);setDocuments([]);setIndexWarnings([])},[]);
  const removePdf=useCallback(name=>setPdfFiles(p=>p.filter(f=>f.name!==name)),[]);

  // ─── Generate Transmittal ────────────────────────────────
  const handleGenerate=useCallback(async()=>{
    if(!templateFile||documents.length===0)return;
    setGenerating(true);showToast("Generating transmittal...","loading");
    try{
      const form=new FormData();
      form.append("template",templateFile);
      form.append("fields",JSON.stringify({
        date:draft.date, job_num:draft.jobNum, transmittal_num:draft.xmtlNum,
        client:draft.client, project_desc:draft.projectDesc,
        from_name:draft.fromName, from_title:draft.fromTitle,
        from_email:draft.fromEmail, from_phone:draft.fromPhone, firm:draft.firm,
      }));
      form.append("checks",JSON.stringify(checks));
      form.append("contacts",JSON.stringify(contacts.filter(c=>c.name||c.email).map(({name,company,email,phone})=>({name,company,email,phone}))));
      form.append("documents",JSON.stringify(documents.map(d=>({doc_no:d.docNo,desc:d.desc,rev:d.rev}))));
      form.append("output_format",outputFormat);
      for(const pdf of pdfFiles){form.append("pdfs",pdf)}

      const res=await fetch(`${API}/api/render`,{method:"POST",body:form});
      if(!res.ok){const err=await res.json().catch(()=>({}));throw new Error(err.detail||`Server error ${res.status}`);}

      // Download the result
      const blob=await res.blob();
      const ct=res.headers.get("content-type")||"";
      let ext="docx";
      if(ct.includes("pdf"))ext="pdf";
      else if(ct.includes("zip"))ext="zip";
      const filename=`R3P-${draft.jobNum||"XXXX"}_XMTL-${draft.xmtlNum||"001"}.${ext}`;
      const url=URL.createObjectURL(blob);
      const a=document.createElement("a");a.href=url;a.download=filename;document.body.appendChild(a);a.click();
      document.body.removeChild(a);URL.revokeObjectURL(url);

      showToast(`Transmittal generated: ${filename}`,"success");
    }catch(e){
      showToast(`Generation failed: ${e.message}`,"error",8000);
    }finally{setGenerating(false)}
  },[templateFile,documents,draft,checks,contacts,pdfFiles,outputFormat]);

  // ─── Email (placeholder — opens dialog) ──────────────────
  const handleEmail=useCallback(()=>{
    showToast("Email integration: configure SMTP in backend .env to enable","info",5000);
  },[]);

  // ─── Contact list persistence ────────────────────────────
  const onSaveList=useCallback(name=>{
    const clean=contacts.filter(c=>c.name||c.email).map(({name,company,email,phone})=>({name,company,email,phone}));
    if(!clean.length)return;
    persistLists([...savedLists.filter(l=>l.name!==name),{name,contacts:clean,savedAt:new Date().toISOString()}]);
    showToast(`Saved "${name}" (${clean.length} contacts)`,"success",3000);
  },[contacts,savedLists,persistLists]);
  const onLoadList=useCallback(name=>{const list=savedLists.find(l=>l.name===name);if(list){setContacts(list.contacts.map(c=>({...c,id:uid()})));showToast(`Loaded "${name}"`,"success",3000)}},[savedLists]);
  const onDeleteList=useCallback(name=>{persistLists(savedLists.filter(l=>l.name!==name));showToast(`Deleted "${name}"`,"info",3000)},[savedLists,persistLists]);

  return <>
    <style>{CSS}</style>
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column"}}>
      <Header/>
      <div style={{padding:"9px 32px",borderBottom:`1px solid ${T.bdSub}`,display:"flex",alignItems:"center",gap:"8px",fontSize:"12px",fontFamily:T.fM,color:T.t3}}>
        <span style={{color:T.t2}}>Draft</span><span style={{opacity:0.4}}>/</span><span>New Transmittal</span>
        {draft.jobNum&&<><span style={{opacity:0.4}}>/</span><span style={{color:T.acc}}>{draft.jobNum}</span></>}
      </div>
      <div style={{flex:1,display:"grid",gridTemplateColumns:"1fr 280px",gap:"24px",padding:"24px 32px",maxWidth:"1280px",width:"100%",margin:"0 auto"}}>
        <div style={{display:"flex",flexDirection:"column",gap:"18px"}}>
          <ProjectSection draft={draft} u={u}/>
          <OptionsSection checks={checks} toggle={toggle}/>
          <ContactsSection contacts={contacts} updateContact={updateContact} removeContact={removeContact} addContact={addContact} savedLists={savedLists} onSaveList={onSaveList} onLoadList={onLoadList} onDeleteList={onDeleteList}/>
          <DocumentsSection documents={documents} updateDoc={updateDoc} removeDoc={removeDoc} addDoc={addDoc} templateFile={templateFile} indexFile={indexFile} pdfFiles={pdfFiles} onFileDrop={onFileDrop} clearTemplate={clearTemplate} clearIndex={clearIndex} removePdf={removePdf} indexLoading={indexLoading} indexWarnings={indexWarnings}/>
        </div>
        <div style={{position:"sticky",top:"24px",alignSelf:"start"}}>
          <Sidebar draft={draft} checks={checks} contacts={contacts} documents={documents} pdfFiles={pdfFiles} templateFile={templateFile} indexFile={indexFile} outputFormat={outputFormat} setOutputFormat={setOutputFormat} onGenerate={handleGenerate} onEmail={handleEmail} generating={generating}/>
        </div>
      </div>
      <footer style={{padding:"14px 32px",borderTop:`1px solid ${T.bdSub}`,display:"flex",justifyContent:"space-between",fontSize:"11px",fontFamily:T.fM,color:T.t3}}>
        <span>TRANSMITTAL BUILDER v3.0</span><span>© 2019–2026 Koraji</span>
      </footer>
    </div>
    <Toast message={toast?.message} type={toast?.type} onDismiss={()=>setToast(null)}/>
  </>;
}

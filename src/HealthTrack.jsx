import { supabase } from "./supabaseClient";
import { useState, useEffect, useRef } from "react";

// Map the app's storage keys to Supabase table names
const TABLE = {
  "appointments": "appointments",
  "reports": "reports",
  "insurance-cards": "insurance_cards",
  "kiv-clinics": "clinics",
};

// store.get returns the array of {id, ...} objects the app expects.
// store.set(key, arrayOfItems) syncs that array to the table.
const store = {
  async get(key) {
    const table = TABLE[key];
    if (!table) return null;
    const { data, error } = await supabase.from(table).select("id, data");
    if (error) { console.error(error); return null; }
    // Flatten: each row's saved fields live in `data`, and we keep the DB id
    return data.map(row => ({ ...row.data, id: row.id }));
  },
  async set(key, items) {
    const table = TABLE[key];
    if (!table) return false;
    // Simple + reliable strategy: replace this user's rows with the new set.
    const { data: existing } = await supabase.from(table).select("id");
    const existingIds = new Set((existing || []).map(r => r.id));
    const keepIds = new Set(items.map(i => i.id).filter(Boolean));

    // Delete rows the app removed
    const toDelete = [...existingIds].filter(id => !keepIds.has(id));
    if (toDelete.length) await supabase.from(table).delete().in("id", toDelete);

    // Upsert everything currently in the app.
    // If an item's id is one Supabase generated (a uuid), update in place;
    // otherwise insert and let Supabase assign a uuid.
    for (const item of items) {
      const { id, ...fields } = item;
      const looksLikeUuid = typeof id === "string" && id.length === 36 && id.includes("-");
      if (looksLikeUuid && existingIds.has(id)) {
        await supabase.from(table).update({ data: fields }).eq("id", id);
      } else {
        await supabase.from(table).insert({ data: fields });
      }
    }
    return true;
  },
};
// ─── Constants ──────────────────────────────────────────────────────────────────
const CATEGORIES = ["Dental","Vision","Specialist","GP","Annual Wellness"];
const INS_STATUSES = ["Pending","EOB Posted"];
const TYPES = ["Acupuncture / TCM","Eye","Cardiology","Chiropractor","Dermatology","Physical Therapy","Therapy","Others"];
const MONTHS = [
  {value:"01",label:"January"},{value:"02",label:"February"},{value:"03",label:"March"},
  {value:"04",label:"April"},{value:"05",label:"May"},{value:"06",label:"June"},
  {value:"07",label:"July"},{value:"08",label:"August"},{value:"09",label:"September"},
  {value:"10",label:"October"},{value:"11",label:"November"},{value:"12",label:"December"},
];
const INS_TYPES = ["Medical","Dental","Vision","Life","Disability","Other"];

// ── Palette — calm modern telehealth (blue) ──
const C = {
  canvas:"#F4F6FB", surface:"#FFFFFF", ink:"#1A2233", sub:"#5B6478", faint:"#98A0B3",
  line:"#E4E8F0", lineSoft:"#EFF2F8", accent:"#2563EB", accentSoft:"#2563EB1A",
  lav:"#7C6CD6", lavSoft:"#7C6CD61A", blue:"#2563EB",
  paid:"#1A2233", due:"#1A2233", pending:"#4F6BD6",
  tintBg:"#EFF3FC",
};
// Category tints — cohesive blue → lavender range
const CAT_COLORS = { Dental:"#1D4ED8",Vision:"#3B62D6",Specialist:"#6E5BD0",GP:"#4F6BD6","Annual Wellness":"#8A6FD4" };
// Flat soft tint background per category (single solid color, no gradient)
const CAT_TINT = {
  Dental:"#E3EAFC", Vision:"#E7ECFB", Specialist:"#ECE9F9", GP:"#E8EDFB", "Annual Wellness":"#EFE9FA",
};
const INS_TYPE_COLORS = { Medical:"#1D4ED8",Dental:"#3B62D6",Vision:"#6E5BD0",Life:"#4F6BD6",Disability:"#8A6FD4",Other:"#5B6478" };
// Per-type accent colors + flat tints (for Reports subheaders) — blue → lavender
const TYPE_COLORS = {
  "Acupuncture / TCM":"#8A6FD4","Eye":"#1D4ED8","Cardiology":"#6E5BD0","Chiropractor":"#4F6BD6",
  "Dermatology":"#3B62D6","Physical Therapy":"#2563EB","Therapy":"#7C6CD6","Others":"#5B6478",
};
const TYPE_TINT = {
  "Acupuncture / TCM":"#EFE9FA","Eye":"#E3EAFC","Cardiology":"#ECE9F9","Chiropractor":"#E8EDFB",
  "Dermatology":"#E7ECFB","Physical Therapy":"#E3EAFC","Therapy":"#ECE9F9","Others":"#F0F2F7",
};

// ─── Utils ──────────────────────────────────────────────────────────────────────
const uid = () => Date.now().toString(36)+Math.random().toString(36).slice(2);
const mapsUrl = q => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
const fmtDate = d => d?new Date(d+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):"—";
const fmtShort = d => d?new Date(d+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"}):"—";
const getYears = rs => { const ys=[...new Set(rs.map(r=>r.date?.slice(0,4)).filter(Boolean))].sort((a,b)=>b-a); const cy=new Date().getFullYear().toString(); if(!ys.includes(cy))ys.unshift(cy); return ys; };
const parseMoney = v => parseFloat(String(v||"").replace(/[^0-9.]/g,""))||0;
const fmtMoney = v => { const n=parseMoney(v); return n>0?`$${Math.round(n).toLocaleString("en-US")}`:"—"; };
function fileToBase64(file){ return new Promise((res,rej)=>{ if(file.size>4.5*1024*1024){rej(new Error(`${file.name} exceeds 4.5 MB`));return;} const r=new FileReader(); r.onload=()=>res({name:file.name,size:file.size,data:r.result}); r.onerror=rej; r.readAsDataURL(file); }); }

// ─── Design tokens ──────────────────────────────────────────────────────────────
const FONT = '"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';
const s = {
  input:{ width:"100%",padding:"11px 13px",borderRadius:10,border:`1px solid ${C.line}`,fontSize:14,color:C.ink,outline:"none",boxSizing:"border-box",background:C.surface,fontFamily:FONT },
  btn:(v="primary")=>({ padding:"10px 18px",borderRadius:10,border:"none",cursor:"pointer",fontSize:13.5,fontWeight:600,fontFamily:FONT,letterSpacing:0.1,
    ...(v==="primary"?{background:C.accent,color:"#fff"}:v==="ghost"?{background:C.surface,border:`1px solid ${C.line}`,color:C.sub}:{background:"#fff",border:`1px solid #FCA5A5`,color:C.due}) }),
  label:{ display:"block",fontSize:11,fontWeight:600,color:C.faint,marginBottom:6,letterSpacing:0.5,textTransform:"uppercase" },
  card:{ background:C.surface,border:`1px solid ${C.line}`,borderRadius:16,boxShadow:"0 1px 3px rgba(21,48,43,0.04)" },
};

// ─── Primitives ─────────────────────────────────────────────────────────────────
const Dot = ({color,size=6}) => <span style={{display:"inline-block",width:size,height:size,borderRadius:"50%",background:color,flexShrink:0}}/>;
const Bar = ({color,height=14}) => <span style={{display:"inline-block",width:3,height,borderRadius:2,background:color,flexShrink:0}}/>;
const Tag = ({label,color}) => (
  <span style={{fontSize:12.5,fontWeight:700,color}}>{label}</span>
);
// Category label as colored text (no bar) so all labels align on the left
const CatTag = ({label,color}) => (
  <span style={{fontSize:12.5,fontWeight:700,color}}>{label}</span>
);
const StatusTag = ({label,color}) => (
  <span style={{display:"inline-flex",alignItems:"center",padding:"2px 9px",borderRadius:4,fontSize:11.5,fontWeight:600,color,background:color+"12",letterSpacing:0.2}}>{label}</span>
);
// Icon-based edit/delete menu — a pencil that opens a small popover
function EditMenu({onEdit,onDelete}){
  const [open,setOpen]=useState(false);
  const ref=useRef(null);
  useEffect(()=>{
    if(!open)return;
    const h=e=>{ if(ref.current && !ref.current.contains(e.target)) setOpen(false); };
    window.addEventListener("mousedown",h);
    return ()=>window.removeEventListener("mousedown",h);
  },[open]);
  return (
    <div ref={ref} style={{position:"relative",display:"inline-block"}}>
      <button onClick={e=>{e.stopPropagation();setOpen(o=>!o);}} title="Edit or delete"
        style={{background:"none",border:"none",cursor:"pointer",padding:"4px 6px",borderRadius:6,color:C.faint,display:"flex",alignItems:"center",lineHeight:0}}
        onMouseEnter={e=>{e.currentTarget.style.background=C.lineSoft;e.currentTarget.style.color=C.ink;}}
        onMouseLeave={e=>{e.currentTarget.style.background="none";e.currentTarget.style.color=C.faint;}}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
      </button>
      {open&&(
        <div style={{position:"absolute",right:0,top:"calc(100% + 4px)",background:C.surface,border:`1px solid ${C.line}`,borderRadius:8,boxShadow:"0 8px 24px rgba(31,27,46,0.12)",zIndex:100,overflow:"hidden",minWidth:120}}>
          <button onClick={e=>{e.stopPropagation();setOpen(false);onEdit();}} style={{display:"flex",alignItems:"center",gap:8,width:"100%",padding:"9px 13px",background:"none",border:"none",cursor:"pointer",fontFamily:FONT,fontSize:13,color:C.ink,textAlign:"left"}}
            onMouseEnter={e=>e.currentTarget.style.background=C.canvas} onMouseLeave={e=>e.currentTarget.style.background="none"}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
            Edit
          </button>
          <button onClick={e=>{e.stopPropagation();setOpen(false);onDelete();}} style={{display:"flex",alignItems:"center",gap:8,width:"100%",padding:"9px 13px",background:"none",border:"none",borderTop:`1px solid ${C.lineSoft}`,cursor:"pointer",fontFamily:FONT,fontSize:13,color:C.due,textAlign:"left"}}
            onMouseEnter={e=>e.currentTarget.style.background="#FEF2F2"} onMouseLeave={e=>e.currentTarget.style.background="none"}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
const Field = ({label,required,hint,children}) => (
  <div style={{marginBottom:16}}>
    <label style={s.label}>{label}{required&&<span style={{color:C.due,marginLeft:3}}>*</span>}</label>
    {children}
    {hint&&<p style={{margin:"5px 0 0",fontSize:11,color:C.faint}}>{hint}</p>}
  </div>
);
function SI({value,onChange,placeholder,type="text"}){
  const [f,setF]=useState(false);
  return <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
    style={{...s.input,borderColor:f?C.accent:C.line,boxShadow:f?`0 0 0 3px ${C.accentSoft}`:"none",transition:"border-color .12s,box-shadow .12s"}}
    onFocus={()=>setF(true)} onBlur={()=>setF(false)}/>;
}
function SS({value,onChange,options,placeholder}){
  const [f,setF]=useState(false);
  return (
    <select value={value} onChange={e=>onChange(e.target.value)} onFocus={()=>setF(true)} onBlur={()=>setF(false)}
      style={{...s.input,appearance:"none",cursor:"pointer",color:value?C.ink:C.faint,borderColor:f?C.accent:C.line,boxShadow:f?`0 0 0 3px ${C.accentSoft}`:"none",transition:"border-color .12s,box-shadow .12s",
        backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23A1A1AA'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`,
        backgroundRepeat:"no-repeat",backgroundPosition:"right 10px center",backgroundSize:16,paddingRight:34}}>
      {placeholder&&<option value="">{placeholder}</option>}
      {options.map(o=><option key={o} value={o}>{o}</option>)}
    </select>
  );
}
function STA({value,onChange,placeholder,rows=3}){
  const [f,setF]=useState(false);
  return <textarea value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} rows={rows}
    style={{...s.input,resize:"vertical",borderColor:f?C.accent:C.line,boxShadow:f?`0 0 0 3px ${C.accentSoft}`:"none",transition:"border-color .12s,box-shadow .12s"}}
    onFocus={()=>setF(true)} onBlur={()=>setF(false)}/>;
}
function FilterSelect({value,onChange,options,placeholder,minWidth=120}){
  return (
    <select value={value} onChange={e=>onChange(e.target.value)}
      style={{padding:"6px 26px 6px 11px",borderRadius:6,fontSize:12.5,fontFamily:FONT,
        border:`1px solid ${value?C.accent:C.line}`,color:value?C.ink:C.faint,background:C.surface,appearance:"none",cursor:"pointer",minWidth,outline:"none",
        backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23A1A1AA'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`,
        backgroundRepeat:"no-repeat",backgroundPosition:"right 8px center",backgroundSize:13}}>
      <option value="">{placeholder}</option>
      {options.map(o=>typeof o==="string"?<option key={o} value={o}>{o}</option>:<option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
function FileUpload({files=[],onUpload,onRemove,label}){
  const ref=useRef(); const [err,setErr]=useState("");
  const handle=async e=>{ setErr(""); const res=[]; for(const f of Array.from(e.target.files)){try{res.push(await fileToBase64(f));}catch(ex){setErr(ex.message);}} if(res.length)onUpload(res); e.target.value=""; };
  return (
    <div>
      {files.length>0&&<div style={{marginBottom:8}}>{files.map((f,i)=>(
        <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",background:C.lineSoft,borderRadius:5,marginBottom:4}}>
          <a href={f.data} download={f.name} style={{flex:1,fontSize:12,color:C.accent,textDecoration:"none",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.name}</a>
          <button onClick={()=>onRemove(i)} style={{background:"none",border:"none",cursor:"pointer",color:C.faint,fontSize:16,padding:"0 2px",lineHeight:1}}>×</button>
        </div>
      ))}</div>}
      <button type="button" onClick={()=>ref.current?.click()}
        style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,width:"100%",padding:"9px 14px",border:`1px dashed ${C.line}`,borderRadius:6,background:C.canvas,cursor:"pointer",fontSize:12.5,color:C.sub,fontFamily:FONT,transition:"border-color .12s,color .12s"}}
        onMouseEnter={e=>{e.currentTarget.style.borderColor=C.accent;e.currentTarget.style.color=C.accent;}}
        onMouseLeave={e=>{e.currentTarget.style.borderColor=C.line;e.currentTarget.style.color=C.sub;}}>Upload {label||"file"}</button>
      {err&&<p style={{margin:"5px 0 0",fontSize:12,color:C.due}}>{err}</p>}
      <input ref={ref} type="file" multiple accept="image/*,.pdf,.doc,.docx" onChange={handle} style={{display:"none"}}/>
    </div>
  );
}
function Modal({title,onClose,children,wide}){
  useEffect(()=>{const esc=e=>e.key==="Escape"&&onClose();window.addEventListener("keydown",esc);return()=>window.removeEventListener("keydown",esc);},[]);
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(24,24,27,0.4)",backdropFilter:"blur(2px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:16}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:C.surface,borderRadius:12,width:"100%",maxWidth:wide?720:520,maxHeight:"92vh",overflowY:"auto",boxShadow:"0 20px 50px rgba(0,0,0,0.15)",border:`1px solid ${C.line}`}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"18px 24px",borderBottom:`1px solid ${C.lineSoft}`,position:"sticky",top:0,background:C.surface,zIndex:1}}>
          <h2 style={{margin:0,fontSize:16,fontWeight:700,color:C.ink,letterSpacing:-0.2}}>{title}</h2>
          <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",fontSize:15,color:C.faint,width:28,height:28,display:"flex",alignItems:"center",justifyContent:"center",borderRadius:5}}
            onMouseEnter={e=>e.currentTarget.style.background=C.lineSoft} onMouseLeave={e=>e.currentTarget.style.background="none"}>✕</button>
        </div>
        <div style={{padding:"22px 24px"}}>{children}</div>
      </div>
    </div>
  );
}
function ConfirmModal({message,onConfirm,onCancel}){
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(24,24,27,0.4)",backdropFilter:"blur(2px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:2000,padding:16}}>
      <div style={{background:C.surface,borderRadius:12,padding:24,maxWidth:360,width:"100%",boxShadow:"0 20px 50px rgba(0,0,0,0.15)"}}>
        <p style={{margin:"0 0 20px",fontSize:14.5,color:C.ink,lineHeight:1.5}}>{message}</p>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          <button onClick={onCancel} style={s.btn("ghost")}>Cancel</button>
          <button onClick={onConfirm} style={s.btn("danger")}>Delete</button>
        </div>
      </div>
    </div>
  );
}
function CategoryPills({value,onChange}){
  return (
    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
      {["All",...CATEGORIES].map(c=>{
        const active=value===c; const col=CAT_COLORS[c]||C.accent;
        return (
          <button key={c} onClick={()=>onChange(c)} style={{display:"inline-flex",alignItems:"center",gap:7,padding:"7px 15px",borderRadius:20,border:`1px solid ${active?(c==="All"?C.accent:col):C.line}`,cursor:"pointer",fontSize:12.5,fontWeight:active?600:500,fontFamily:FONT,
            background:active?(c==="All"?C.accent:col)+(c==="All"?"":"14"):C.surface,color:active?(c==="All"?"#fff":col):C.sub,transition:"all .12s"}}>
            {c!=="All"&&<Dot color={active?col:col} size={6}/>}{c}
          </button>
        );
      })}
    </div>
  );
}
const FilterBar = ({filters,onClear,children,action}) => (
  <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center",marginBottom:20}}>
    {children}
    {filters&&<button onClick={onClear} style={{fontSize:11.5,color:C.faint,background:"none",border:"none",cursor:"pointer",fontFamily:FONT,padding:"4px 6px",textDecoration:"underline",textUnderlineOffset:2}}>Clear</button>}
    {action&&<div style={{marginLeft:"auto"}}>{action}</div>}
  </div>
);
const EmptyState = ({children}) => (
  <div style={{textAlign:"center",padding:"72px 20px",border:`1px dashed ${C.line}`,borderRadius:10}}>
    <p style={{fontSize:14,margin:0,color:C.faint}}>{children}</p>
  </div>
);
const SectionHead = ({children,right}) => (
  <div style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",marginBottom:14}}>
    <h3 style={{margin:0,fontSize:12,fontWeight:700,color:C.faint,letterSpacing:0.8,textTransform:"uppercase"}}>{children}</h3>
    {right}
  </div>
);

// ─── Appointment modal ──────────────────────────────────────────────────────────
const BLANK_APT = {id:"",category:"",type:"",clinic:"",clinicContact:"",date:"",paidAmount:"",toPayAmount:"",paid:false,receipts:[],insuranceStatus:"",eobs:[],notes:"",nextAppointmentDate:""};
function AppointmentModal({appt,onSave,onClose,titleOverride,saveLabel}){
  const [f,setF]=useState({...BLANK_APT,...(appt||{})});
  const set=k=>v=>setF(p=>({...p,[k]:v}));
  const [err,setErr]=useState("");
  const handleSave=()=>{if(!f.date){setErr("Appointment date is required.");return;}onSave({...f,id:f.id||uid()});};
  const mapLink=q=>(<a href={mapsUrl(q)} target="_blank" rel="noreferrer" style={{display:"flex",alignItems:"center",padding:"0 12px",background:C.lineSoft,borderRadius:6,textDecoration:"none",fontSize:12,color:C.accent,flexShrink:0,fontWeight:600}}>Map</a>);
  return (
    <Modal title={titleOverride||(f.id?"Edit appointment":"New appointment")} onClose={onClose} wide>
      {err&&<div style={{background:"#FEF2F2",borderRadius:6,padding:"9px 12px",marginBottom:16,fontSize:13,color:C.due}}>{err}</div>}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 16px"}}>
        <Field label="Category"><SS value={f.category} onChange={set("category")} options={CATEGORIES} placeholder="Select category"/></Field>
        <Field label="Type"><SS value={f.type} onChange={set("type")} options={TYPES} placeholder="Select type"/></Field>
        <Field label="Clinic" hint={f.clinic?"Opens in Google Maps":"Map link auto-generates"}>
          <div style={{display:"flex",gap:6}}><SI value={f.clinic} onChange={set("clinic")} placeholder="Clinic or provider"/>{f.clinic&&mapLink(f.clinic)}</div>
        </Field>
        <Field label="Clinic contact"><SI value={f.clinicContact} onChange={set("clinicContact")} placeholder="Phone or email"/></Field>
        <Field label="Appointment date" required><SI type="date" value={f.date} onChange={set("date")}/></Field>
        <Field label="Next appointment date"><SI type="date" value={f.nextAppointmentDate} onChange={set("nextAppointmentDate")}/></Field>
        <Field label="Amount paid"><SI value={f.paidAmount} onChange={set("paidAmount")} placeholder="0.00"/></Field>
        <Field label="Amount to pay"><SI value={f.toPayAmount} onChange={set("toPayAmount")} placeholder="0.00"/></Field>
        <Field label="Insurance status"><SS value={f.insuranceStatus} onChange={set("insuranceStatus")} options={INS_STATUSES} placeholder="Select status"/></Field>
        <div/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 16px"}}>
        <Field label="Payment">
          <label style={{display:"flex",alignItems:"center",gap:9,cursor:"pointer",fontSize:13.5,color:C.sub,padding:"9px 12px",border:`1px solid ${C.line}`,borderRadius:6,marginBottom:8,background:C.canvas}}>
            <input type="checkbox" checked={f.paid} onChange={e=>set("paid")(e.target.checked)} style={{width:15,height:15,accentColor:C.paid,cursor:"pointer"}}/>Mark as paid
          </label>
          <FileUpload label="receipt" files={f.receipts} onUpload={fs=>set("receipts")([...(f.receipts||[]),...fs])} onRemove={i=>set("receipts")(f.receipts.filter((_,idx)=>idx!==i))}/>
        </Field>
        <Field label="EOB / claim documents">
          <div style={{padding:"9px 12px",border:`1px solid ${C.line}`,borderRadius:6,marginBottom:8,background:C.canvas,fontSize:12.5,color:C.sub}}>Status: <strong style={{color:f.insuranceStatus?C.ink:C.faint,fontWeight:600}}>{f.insuranceStatus||"Not set"}</strong></div>
          <FileUpload label="EOB" files={f.eobs} onUpload={fs=>set("eobs")([...(f.eobs||[]),...fs])} onRemove={i=>set("eobs")(f.eobs.filter((_,idx)=>idx!==i))}/>
        </Field>
      </div>
      <Field label="Notes"><STA value={f.notes} onChange={set("notes")} placeholder="Any additional notes" rows={2}/></Field>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end",paddingTop:14,borderTop:`1px solid ${C.lineSoft}`,marginTop:6}}>
        <button onClick={onClose} style={s.btn("ghost")}>Cancel</button>
        <button onClick={handleSave} style={s.btn("primary")}>{saveLabel||"Save"}</button>
      </div>
    </Modal>
  );
}

// ─── Records table ──────────────────────────────────────────────────────────────
const RT_COLS=[
  {key:"menu",label:"",sort:null},
  {key:"category",label:"Category",sort:"category"},
  {key:"type",label:"Type",sort:"type"},
  {key:"date",label:"Date",sort:"date"},
  {key:"clinic",label:"Clinic",sort:"clinic"},
  {key:"paid",label:"Paid",sort:"paid"},
  {key:"toPay",label:"To pay",sort:"toPay"},
  {key:"insurance",label:"Insurance",sort:"insurance"},
  {key:"next",label:"Next Appointment",sort:"next"},
  {key:"notes",label:"Notes",sort:null},
];
function RecordsTable({records,onEdit,onDelete,sortBy,dir,onSort}){
  return (
    <div style={{border:`1px solid ${C.line}`,borderRadius:10,overflow:"visible",background:C.surface,boxShadow:"0 1px 2px rgba(31,27,46,0.03)"}}>
      <div style={{overflowX:"auto",borderRadius:10}}>
        <table style={{width:"100%",borderCollapse:"collapse",minWidth:980}}>
          <thead>
            <tr style={{background:C.tintBg,borderBottom:`1px solid ${C.line}`}}>
              {RT_COLS.map(col=>{
                const sortable=col.sort&&onSort;
                const active=sortBy===col.sort;
                return (
                  <th key={col.key} onClick={sortable?()=>onSort(col.sort):undefined}
                    style={{padding:"9px 12px",textAlign:"left",fontSize:10,fontWeight:700,color:active?C.accent:C.sub,letterSpacing:0.5,textTransform:"uppercase",whiteSpace:"nowrap",cursor:sortable?"pointer":"default",userSelect:"none"}}>
                    {col.label}{active&&<span style={{fontSize:9,marginLeft:4}}>{dir==="asc"?"▲":"▼"}</span>}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {records.map((r,i)=>{
              const cc=CAT_COLORS[r.category]||C.faint;
              const ic=r.insuranceStatus==="EOB Posted"?C.paid:r.insuranceStatus==="Pending"?C.pending:null;
              return (
                <tr key={r.id} style={{borderBottom:i<records.length-1?`1px solid ${C.lineSoft}`:"none",transition:"background .1s"}}
                  onMouseEnter={e=>e.currentTarget.style.background=C.canvas}
                onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <td style={{padding:"9px 12px",textAlign:"left",whiteSpace:"nowrap"}}>
                  <div style={{display:"flex",justifyContent:"flex-start"}}>
                    <EditMenu onEdit={()=>onEdit(r)} onDelete={()=>onDelete(r.id)}/>
                  </div>
                </td>
                <td style={{padding:"9px 12px",textAlign:"left",whiteSpace:"nowrap"}}>{r.category?<CatTag label={r.category} color={cc}/>:<span style={{color:C.faint,fontSize:13}}>—</span>}</td>
                <td style={{padding:"9px 12px",textAlign:"left",fontSize:13,fontWeight:r.type?600:400,color:r.type?(TYPE_COLORS[r.type]||C.sub):C.faint,whiteSpace:"nowrap"}}>{r.type||"—"}</td>
                <td style={{padding:"9px 12px",textAlign:"left",fontSize:13,color:C.ink,whiteSpace:"nowrap"}}>{r.date?fmtDate(r.date):<span style={{color:C.faint}}>—</span>}</td>
                <td style={{padding:"9px 12px",textAlign:"left",maxWidth:170}}>
                  {r.clinic?<div style={{display:"flex",alignItems:"center",gap:6,fontSize:13,color:C.sub}}>
                    <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.clinic}</span>
                    <a href={mapsUrl(r.clinic)} target="_blank" rel="noreferrer" style={{fontSize:11,color:C.accent,textDecoration:"none",fontWeight:600,flexShrink:0}}>Map</a>
                  </div>:<span style={{color:C.faint,fontSize:13}}>—</span>}
                </td>
                <td style={{padding:"9px 12px",textAlign:"left",fontSize:13,color:C.ink,fontWeight:parseMoney(r.paidAmount)>0?600:400,whiteSpace:"nowrap"}}>{fmtMoney(r.paidAmount)}</td>
                <td style={{padding:"9px 12px",textAlign:"left",fontSize:13,color:C.ink,fontWeight:parseMoney(r.toPayAmount)>0?600:400,whiteSpace:"nowrap"}}>{fmtMoney(r.toPayAmount)}</td>
                <td style={{padding:"9px 12px",textAlign:"left",whiteSpace:"nowrap"}}>{r.insuranceStatus&&ic?<StatusTag label={r.insuranceStatus} color={ic}/>:<span style={{color:C.faint,fontSize:13}}>—</span>}</td>
                <td style={{padding:"9px 12px",textAlign:"left",fontSize:13,color:C.sub,whiteSpace:"nowrap"}}>{r.nextAppointmentDate?fmtShort(r.nextAppointmentDate):<span style={{color:C.faint}}>—</span>}</td>
                <td style={{padding:"9px 12px",textAlign:"left",maxWidth:180}}>{r.notes?<span style={{fontSize:12.5,color:C.sub,display:"inline-block",maxWidth:170,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",verticalAlign:"bottom"}} title={r.notes}>{r.notes}</span>:<span style={{color:C.faint,fontSize:13}}>—</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}

// ─── Appointments tab ───────────────────────────────────────────────────────────
function sortRecords(list,sortBy,dir){
  const s=[...list];
  const m=dir==="asc"?1:-1;
  s.sort((a,b)=>{
    let av,bv;
    switch(sortBy){
      case "paid": av=parseMoney(a.paidAmount); bv=parseMoney(b.paidAmount); break;
      case "toPay": av=parseMoney(a.toPayAmount); bv=parseMoney(b.toPayAmount); break;
      case "type": av=(a.type||"").toLowerCase(); bv=(b.type||"").toLowerCase(); break;
      case "category": av=(a.category||"").toLowerCase(); bv=(b.category||"").toLowerCase(); break;
      case "clinic": av=(a.clinic||"").toLowerCase(); bv=(b.clinic||"").toLowerCase(); break;
      case "insurance": av=(a.insuranceStatus||"").toLowerCase(); bv=(b.insuranceStatus||"").toLowerCase(); break;
      case "next": av=a.nextAppointmentDate||""; bv=b.nextAppointmentDate||""; break;
      default: av=a.date||""; bv=b.date||"";
    }
    if(av<bv)return -1*m; if(av>bv)return 1*m; return 0;
  });
  return s;
}
function AppointmentsTab(){
  const [apts,setApts]=useState([]); const [loading,setLoading]=useState(true);
  const [modal,setModal]=useState(null); const [confirm,setConfirm]=useState(null);
  const [fCat,setFCat]=useState("All"); const [fType,setFType]=useState(""); const [fYear,setFYear]=useState(""); const [fMonth,setFMonth]=useState(""); const [fIns,setFIns]=useState("");
  const [sortBy,setSortBy]=useState("date"); const [dir,setDir]=useState("desc");
  const onSort=key=>{ if(sortBy===key){setDir(d=>d==="asc"?"desc":"asc");} else {setSortBy(key);setDir(key==="date"?"desc":"asc");} };
  useEffect(()=>{store.get("appointments").then(d=>{if(d)setApts(d);setLoading(false);});},[]);
  const persist=async u=>{setApts(u);await store.set("appointments",u);};
  const handleSave=async a=>{const u=a.id&&apts.find(x=>x.id===a.id)?apts.map(x=>x.id===a.id?a:x):[...apts,a];await persist(u);setModal(null);};
  const confirmDelete=async()=>{await persist(apts.filter(a=>a.id!==confirm.id));setConfirm(null);};
  const hasF=fType||fYear||fMonth||fIns; const years=getYears(apts);
  const today=new Date().toISOString().slice(0,10);
  const filtered=apts.filter(a=>fCat==="All"||a.category===fCat).filter(a=>!fType||a.type===fType).filter(a=>!fYear||a.date?.startsWith(fYear)).filter(a=>!fMonth||a.date?.slice(5,7)===fMonth).filter(a=>!fIns||a.insuranceStatus===fIns);
  const upcoming=sortRecords(filtered.filter(a=>(a.date||"")>=today),sortBy,dir);
  const completed=sortRecords(filtered.filter(a=>(a.date||"")<today),sortBy,dir);
  if(loading)return <div style={{textAlign:"center",padding:48,color:C.faint}}>Loading</div>;
  const Section=({title,rows,accent})=>(
    <div style={{marginBottom:18}}>
      <div style={{display:"flex",alignItems:"center",gap:9,marginBottom:11}}>
        <span style={{width:8,height:8,borderRadius:"50%",background:accent,flexShrink:0}}/>
        <span style={{fontSize:12,fontWeight:700,color:C.ink,letterSpacing:0.3}}>{title}</span>
        <span style={{fontSize:11,fontWeight:600,color:accent,background:accent+"18",borderRadius:20,padding:"2px 9px"}}>{rows.length}</span>
      </div>
      {rows.length===0
        ?<div style={{...s.card,fontSize:13,color:C.faint,padding:"18px 18px"}}>{title==="Upcoming appointments"?"Nothing upcoming.":"Nothing completed yet."}</div>
        :<RecordsTable records={rows} sortBy={sortBy} dir={dir} onSort={onSort} onEdit={a=>setModal(a)} onDelete={id=>setConfirm({id,message:"Delete this appointment?"})}/>}
    </div>
  );
  return (
    <div>
      <div style={{marginBottom:16}}>
        <CategoryPills value={fCat} onChange={setFCat}/>
      </div>
      <FilterBar filters={hasF} onClear={()=>{setFType("");setFYear("");setFMonth("");setFIns("");}}
        action={<button onClick={()=>setModal("new")} style={s.btn("primary")}>+ New appointment</button>}>
        <FilterSelect value={fType} onChange={setFType} options={TYPES} placeholder="All types" minWidth={130}/>
        <FilterSelect value={fYear} onChange={setFYear} options={years} placeholder="All years" minWidth={90}/>
        <FilterSelect value={fMonth} onChange={setFMonth} options={MONTHS} placeholder="All months" minWidth={110}/>
        <FilterSelect value={fIns} onChange={setFIns} options={INS_STATUSES} placeholder="Insurance status" minWidth={140}/>
      </FilterBar>
      {filtered.length===0
        ?<EmptyState>{apts.length===0?"No appointments yet. Add your first one.":"No appointments match these filters."}</EmptyState>
        :<><Section title="Upcoming appointments" rows={upcoming} accent={C.blue}/><Section title="Completed appointments" rows={completed} accent={C.accent}/></>}
      {modal&&<AppointmentModal appt={modal==="new"?null:modal} onSave={handleSave} onClose={()=>setModal(null)}/>}
      {confirm&&<ConfirmModal message={confirm.message} onConfirm={confirmDelete} onCancel={()=>setConfirm(null)}/>}
    </div>
  );
}

// ─── Insurance tab ──────────────────────────────────────────────────────────────
const BLANK_INS={id:"",insurer:"",planName:"",type:"",memberId:"",policyNumber:"",groupNumber:"",coverageStart:"",coverageEnd:"",deductible:"",outOfPocket:"",copay:"",phone:"",website:"",notes:""};
function InsuranceCardModal({card,onSave,onClose}){
  const [f,setF]=useState({...BLANK_INS,...(card||{})}); const set=k=>v=>setF(p=>({...p,[k]:v})); const [err,setErr]=useState("");
  const handleSave=()=>{if(!f.insurer){setErr("Insurance company name is required.");return;}onSave({...f,id:f.id||uid()});};
  return (
    <Modal title={f.id?"Edit insurance":"Add insurance"} onClose={onClose} wide>
      {err&&<div style={{background:"#FEF2F2",borderRadius:6,padding:"9px 12px",marginBottom:16,fontSize:13,color:C.due}}>{err}</div>}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 16px"}}>
        <Field label="Insurance company" required><SI value={f.insurer} onChange={set("insurer")} placeholder="e.g. Blue Cross"/></Field>
        <Field label="Plan name"><SI value={f.planName} onChange={set("planName")} placeholder="e.g. PPO Gold"/></Field>
        <Field label="Type"><SS value={f.type} onChange={set("type")} options={INS_TYPES} placeholder="Select type"/></Field>
        <Field label="Member ID"><SI value={f.memberId} onChange={set("memberId")} placeholder="Member ID"/></Field>
        <Field label="Policy number"><SI value={f.policyNumber} onChange={set("policyNumber")} placeholder="Policy #"/></Field>
        <Field label="Group number"><SI value={f.groupNumber} onChange={set("groupNumber")} placeholder="Group #"/></Field>
        <Field label="Coverage start"><SI type="date" value={f.coverageStart} onChange={set("coverageStart")}/></Field>
        <Field label="Coverage end"><SI type="date" value={f.coverageEnd} onChange={set("coverageEnd")}/></Field>
        <Field label="Deductible"><SI value={f.deductible} onChange={set("deductible")} placeholder="e.g. $1,500"/></Field>
        <Field label="Out-of-pocket max"><SI value={f.outOfPocket} onChange={set("outOfPocket")} placeholder="e.g. $5,000"/></Field>
        <Field label="Copay"><SI value={f.copay} onChange={set("copay")} placeholder="e.g. $20/$40"/></Field>
        <Field label="Phone"><SI value={f.phone} onChange={set("phone")} placeholder="1-800-XXX-XXXX"/></Field>
        <div style={{gridColumn:"1/-1"}}>
          <Field label="Website / portal"><SI value={f.website} onChange={set("website")} placeholder="https://"/></Field>
          <Field label="Notes"><STA value={f.notes} onChange={set("notes")} placeholder="Coverage details, in-network providers"/></Field>
        </div>
      </div>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end",paddingTop:14,borderTop:`1px solid ${C.lineSoft}`,marginTop:6}}>
        <button onClick={onClose} style={s.btn("ghost")}>Cancel</button>
        <button onClick={handleSave} style={s.btn("primary")}>Save</button>
      </div>
    </Modal>
  );
}
function InsuranceCard({card,onEdit,onDelete}){
  const col=INS_TYPE_COLORS[card.type]||C.sub;
  const Row=({k,v})=>v?<div style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:`1px solid ${C.lineSoft}`,fontSize:13}}><span style={{color:C.faint}}>{k}</span><span style={{color:C.ink,fontWeight:600}}>{v}</span></div>:null;
  return (
    <div style={{background:C.surface,borderRadius:10,border:`1px solid ${C.line}`,overflow:"hidden"}}>
      <div style={{padding:"16px 18px",borderBottom:`1px solid ${C.lineSoft}`,display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div>
          <div style={{display:"inline-flex",alignItems:"center",gap:6,marginBottom:6}}><Dot color={col} size={7}/><span style={{fontSize:10.5,fontWeight:700,color:col,letterSpacing:0.6,textTransform:"uppercase"}}>{card.type||"Insurance"}</span></div>
          <div style={{fontSize:16,fontWeight:700,color:C.ink,letterSpacing:-0.2}}>{card.insurer||"—"}</div>
          {card.planName&&<div style={{fontSize:12.5,color:C.faint,marginTop:2}}>{card.planName}</div>}
        </div>
        <div style={{display:"flex",gap:2}}>
          <EditMenu onEdit={onEdit} onDelete={onDelete}/>
        </div>
      </div>
      <div style={{padding:"6px 18px 14px"}}>
        <Row k="Member ID" v={card.memberId}/><Row k="Policy #" v={card.policyNumber}/><Row k="Group #" v={card.groupNumber}/>
        <Row k="Deductible" v={card.deductible}/><Row k="Copay" v={card.copay}/><Row k="Phone" v={card.phone}/>
        {(card.coverageStart||card.coverageEnd)&&<div style={{fontSize:11.5,color:C.faint,marginTop:10}}>Coverage {card.coverageStart?fmtShort(card.coverageStart):"?"} – {card.coverageEnd?fmtShort(card.coverageEnd):"ongoing"}</div>}
        {card.website&&<a href={card.website} target="_blank" rel="noreferrer" style={{display:"inline-block",marginTop:8,fontSize:12,color:C.accent,textDecoration:"none",fontWeight:600}}>Member portal →</a>}
      </div>
    </div>
  );
}
function InsuranceTab(){
  const [cards,setCards]=useState([]); const [loading,setLoading]=useState(true); const [modal,setModal]=useState(null); const [confirm,setConfirm]=useState(null);
  useEffect(()=>{store.get("insurance-cards").then(d=>{if(d)setCards(d);setLoading(false);});},[]);
  const persist=async u=>{setCards(u);await store.set("insurance-cards",u);};
  const handleSave=async c=>{const u=c.id&&cards.find(x=>x.id===c.id)?cards.map(x=>x.id===c.id?c:x):[...cards,c];await persist(u);setModal(null);};
  const confirmDelete=async()=>{await persist(cards.filter(c=>c.id!==confirm.id));setConfirm(null);};
  if(loading)return <div style={{textAlign:"center",padding:48,color:C.faint}}>Loading</div>;
  return (
    <div>
      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:20}}><button onClick={()=>setModal({})} style={s.btn("primary")}>+ Add insurance</button></div>
      {cards.length===0?<EmptyState>No insurance cards saved yet.</EmptyState>
        :<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:16}}>{cards.map(c=><InsuranceCard key={c.id} card={c} onEdit={()=>setModal(c)} onDelete={()=>setConfirm({id:c.id,message:"Remove this insurance card?"})}/>)}</div>}
      {modal&&<InsuranceCardModal card={modal} onSave={handleSave} onClose={()=>setModal(null)}/>}
      {confirm&&<ConfirmModal message={confirm.message} onConfirm={confirmDelete} onCancel={()=>setConfirm(null)}/>}
    </div>
  );
}

// ─── Clinics tab ────────────────────────────────────────────────────────────────
const BLANK_CLINIC={id:"",name:"",category:"",type:"",contact:"",location:""};
function ClinicModal({clinic,onSave,onClose}){
  const [f,setF]=useState({...BLANK_CLINIC,...(clinic||{})}); const set=k=>v=>setF(p=>({...p,[k]:v})); const [err,setErr]=useState("");
  const handleSave=()=>{if(!f.name){setErr("Clinic name is required.");return;}onSave({...f,id:f.id||uid()});};
  return (
    <Modal title={f.id?"Edit clinic":"Add clinic"} onClose={onClose}>
      {err&&<div style={{background:"#FEF2F2",borderRadius:6,padding:"9px 12px",marginBottom:16,fontSize:13,color:C.due}}>{err}</div>}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 16px"}}>
        <Field label="Category"><SS value={f.category} onChange={set("category")} options={CATEGORIES} placeholder="Select category"/></Field>
        <Field label="Type"><SS value={f.type} onChange={set("type")} options={TYPES} placeholder="Select type"/></Field>
      </div>
      <Field label="Clinic / provider name" required><SI value={f.name} onChange={set("name")} placeholder="Clinic name"/></Field>
      <Field label="Contact"><SI value={f.contact} onChange={set("contact")} placeholder="Phone or email"/></Field>
      <Field label="Location" hint="A map link will auto-generate">
        <div style={{display:"flex",gap:6}}><SI value={f.location} onChange={set("location")} placeholder="Address or area"/>
          {f.location&&<a href={mapsUrl(f.location)} target="_blank" rel="noreferrer" style={{display:"flex",alignItems:"center",padding:"0 12px",background:C.lineSoft,borderRadius:6,textDecoration:"none",fontSize:12,color:C.accent,flexShrink:0,fontWeight:600}}>Map</a>}
        </div>
      </Field>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end",paddingTop:14,borderTop:`1px solid ${C.lineSoft}`,marginTop:6}}>
        <button onClick={onClose} style={s.btn("ghost")}>Cancel</button>
        <button onClick={handleSave} style={s.btn("primary")}>Save</button>
      </div>
    </Modal>
  );
}
const CLINIC_COLS = "minmax(0,2fr) minmax(0,1.4fr) minmax(0,1.8fr) 96px";
function ClinicRow({clinic,color,last,onEdit,onDelete}){
  return (
    <div style={{display:"grid",gridTemplateColumns:CLINIC_COLS,gap:14,alignItems:"center",padding:"9px 14px",borderBottom:last?"none":`1px solid ${C.lineSoft}`,transition:"background .1s"}}
      onMouseEnter={e=>e.currentTarget.style.background=C.canvas} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
      <div style={{minWidth:0}}>
        <div style={{fontSize:13.5,fontWeight:700,color:color,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{clinic.name}</div>
        {clinic.type&&<div style={{fontSize:12,color:C.faint,marginTop:1}}>{clinic.type}</div>}
      </div>
      <div style={{fontSize:13,color:C.sub,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{clinic.contact||<span style={{color:C.faint}}>—</span>}</div>
      <div style={{fontSize:13,color:C.sub,minWidth:0,display:"flex",alignItems:"center",gap:6}}>
        {clinic.location?<><span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{clinic.location}</span><a href={mapsUrl(clinic.location)} target="_blank" rel="noreferrer" style={{fontSize:11,color:C.accent,textDecoration:"none",fontWeight:600,flexShrink:0}}>Map</a></>:<span style={{color:C.faint}}>—</span>}
      </div>
      <div style={{display:"flex",flexShrink:0,justifyContent:"flex-end"}}>
        <EditMenu onEdit={onEdit} onDelete={onDelete}/>
      </div>
    </div>
  );
}
function ClinicsTab(){
  const [clinics,setClinics]=useState([]); const [loading,setLoading]=useState(true); const [modal,setModal]=useState(null); const [confirm,setConfirm]=useState(null);
  const [fCat,setFCat]=useState("All"); const [fType,setFType]=useState(""); const [fLoc,setFLoc]=useState("");
  const [collapsed,setCollapsed]=useState({});
  const toggle=cat=>setCollapsed(p=>({...p,[cat]:!p[cat]}));
  useEffect(()=>{store.get("kiv-clinics").then(d=>{if(d)setClinics(d);setLoading(false);});},[]);
  const persist=async u=>{setClinics(u);await store.set("kiv-clinics",u);};
  const handleSave=async c=>{const u=c.id&&clinics.find(x=>x.id===c.id)?clinics.map(x=>x.id===c.id?c:x):[...clinics,c];await persist(u);setModal(null);};
  const confirmDelete=async()=>{await persist(clinics.filter(c=>c.id!==confirm.id));setConfirm(null);};
  const filtered=clinics.filter(c=>fCat==="All"||c.category===fCat).filter(c=>!fType||c.type===fType).filter(c=>!fLoc||c.location?.toLowerCase().includes(fLoc.toLowerCase()));
  const grouped=CATEGORIES.reduce((a,cat)=>{a[cat]=filtered.filter(c=>c.category===cat);return a;},{});
  const uncat=filtered.filter(c=>!c.category||!CATEGORIES.includes(c.category));
  const anyResult=filtered.length>0;
  if(loading)return <div style={{textAlign:"center",padding:48,color:C.faint}}>Loading</div>;
  const Group=({cat,label,color,tint,items})=>items.length>0&&(
    <div style={{marginBottom:16,border:`1px solid ${C.line}`,borderRadius:16,overflow:"hidden",background:C.surface,boxShadow:"0 1px 3px rgba(21,48,43,0.04)"}}>
      <div style={{background:tint,borderBottom:collapsed[cat]?"none":`1px solid ${C.lineSoft}`}}>
        <div onClick={()=>toggle(cat)} style={{display:"flex",alignItems:"center",gap:9,padding:"11px 16px 10px",cursor:"pointer",userSelect:"none"}}>
          <span style={{display:"inline-flex",transition:"transform .15s",transform:collapsed[cat]?"rotate(-90deg)":"rotate(0deg)",color:C.sub,fontSize:11}}>▾</span>
          <span style={{fontSize:12,fontWeight:700,color:color,letterSpacing:0.4,textTransform:"uppercase"}}>{label}</span>
          <span style={{fontSize:11,fontWeight:600,color:color,background:C.surface+"CC",borderRadius:20,padding:"2px 9px"}}>{items.length}</span>
        </div>
        {!collapsed[cat]&&(
          <div style={{display:"grid",gridTemplateColumns:CLINIC_COLS,gap:14,padding:"0 16px 8px 16px"}}>
            {["Clinic","Contact","Location",""].map((h,i)=>(
              <div key={i} style={{fontSize:10,fontWeight:700,color:C.sub,letterSpacing:0.5,textTransform:"uppercase",opacity:0.6,textAlign:i===3?"right":"left"}}>{h}</div>
            ))}
          </div>
        )}
      </div>
      {!collapsed[cat]&&items.map((c,i)=><ClinicRow key={c.id} clinic={c} color={color} last={i===items.length-1} onEdit={()=>setModal(c)} onDelete={()=>setConfirm({id:c.id,message:"Remove this clinic?"})}/>)}
    </div>
  );
  const UNCAT_TINT="#F1F3F2";
  return (
    <div>
      <div style={{marginBottom:16}}>
        <CategoryPills value={fCat} onChange={setFCat}/>
      </div>
      <FilterBar filters={fType||fLoc} onClear={()=>{setFType("");setFLoc("");}}
        action={<button onClick={()=>setModal({})} style={s.btn("primary")}>+ Add clinic</button>}>
        <FilterSelect value={fType} onChange={setFType} options={TYPES} placeholder="All types" minWidth={130}/>
        <input value={fLoc} onChange={e=>setFLoc(e.target.value)} placeholder="Search location"
          style={{padding:"6px 11px",fontSize:12.5,fontFamily:FONT,border:`1px solid ${fLoc?C.accent:C.line}`,background:C.surface,color:C.ink,width:180,borderRadius:6,outline:"none"}}/>
      </FilterBar>
      {clinics.length===0?<EmptyState>No clinics saved yet. Add ones you want to keep track of.</EmptyState>
        :!anyResult?<EmptyState>No clinics match your filters.</EmptyState>
        :<div>{CATEGORIES.map(cat=><Group key={cat} cat={cat} label={cat} color={CAT_COLORS[cat]} tint={CAT_TINT[cat]} items={grouped[cat]}/>)}<Group cat="__uncat" label="Uncategorized" color={C.faint} tint={UNCAT_TINT} items={uncat}/></div>}
      {modal&&<ClinicModal clinic={modal} onSave={handleSave} onClose={()=>setModal(null)}/>}
      {confirm&&<ConfirmModal message={confirm.message} onConfirm={confirmDelete} onCancel={()=>setConfirm(null)}/>}
    </div>
  );
}

// ─── Reports tab ────────────────────────────────────────────────────────────────
const BLANK_REPORT={id:"",title:"",category:"",type:"",date:"",files:[],notes:""};
function ReportModal({report,onSave,onClose}){
  const [f,setF]=useState({...BLANK_REPORT,...(report||{})});
  const set=k=>v=>setF(p=>({...p,[k]:v}));
  const [err,setErr]=useState("");
  const handleSave=()=>{if(!f.title.trim()){setErr("Report title is required.");return;}onSave({...f,id:f.id||uid()});};
  return (
    <Modal title={f.id?"Edit report":"Add medical report"} onClose={onClose} wide>
      {err&&<div style={{background:"#FEF2F2",borderRadius:6,padding:"9px 12px",marginBottom:16,fontSize:13,color:C.due}}>{err}</div>}
      <Field label="Report title" required><SI value={f.title} onChange={set("title")} placeholder="e.g. Blood test results, MRI scan"/></Field>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"0 16px"}}>
        <Field label="Category"><SS value={f.category} onChange={set("category")} options={CATEGORIES} placeholder="Select category"/></Field>
        <Field label="Type"><SS value={f.type} onChange={set("type")} options={TYPES} placeholder="Select type"/></Field>
        <Field label="Report date"><SI type="date" value={f.date} onChange={set("date")}/></Field>
      </div>
      <Field label="Report files" hint="Upload scans, lab results, or PDFs">
        <FileUpload label="report" files={f.files} onUpload={fs=>set("files")([...(f.files||[]),...fs])} onRemove={i=>set("files")(f.files.filter((_,idx)=>idx!==i))}/>
      </Field>
      <Field label="Notes"><STA value={f.notes} onChange={set("notes")} placeholder="Findings, follow-ups, doctor's remarks, anything to remember" rows={4}/></Field>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end",paddingTop:14,borderTop:`1px solid ${C.lineSoft}`,marginTop:6}}>
        <button onClick={onClose} style={s.btn("ghost")}>Cancel</button>
        <button onClick={handleSave} style={s.btn("primary")}>{f.id?"Save":"Add report"}</button>
      </div>
    </Modal>
  );
}
function ReportCard({report,onEdit,onDelete}){
  const cc=CAT_COLORS[report.category]||C.faint;
  return (
    <div style={{border:`1px solid ${C.line}`,borderRadius:10,background:C.surface,boxShadow:"0 1px 2px rgba(31,27,46,0.03)",textAlign:"left"}}>
      <div style={{padding:"11px 14px",minWidth:0,textAlign:"left"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12}}>
          <div style={{minWidth:0,textAlign:"left"}}>
            <div style={{fontSize:14,fontWeight:700,color:cc,marginBottom:4,textAlign:"left"}}>{report.title||"Untitled report"}</div>
            <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
              {report.category&&<span style={{fontSize:12,fontWeight:700,color:cc}}>{report.category}</span>}
              {report.type&&<span style={{fontSize:12.5,fontWeight:600,color:TYPE_COLORS[report.type]||C.sub}}>{report.type}</span>}
              {report.date&&<span style={{fontSize:12.5,color:C.faint}}>{fmtDate(report.date)}</span>}
            </div>
          </div>
          <div style={{flexShrink:0}}>
            <EditMenu onEdit={onEdit} onDelete={onDelete}/>
          </div>
        </div>
        {report.notes&&<div style={{fontSize:13,color:C.sub,marginTop:8,lineHeight:1.5,whiteSpace:"pre-wrap"}}>{report.notes}</div>}
        {report.files?.length>0&&(
          <div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:10}}>
            {report.files.map((file,i)=>(
              <a key={i} href={file.data} download={file.name} style={{display:"inline-flex",alignItems:"center",gap:6,fontSize:12,color:C.accent,textDecoration:"none",fontWeight:500,background:C.accentSoft,borderRadius:6,padding:"5px 11px"}}>↓ {file.name}</a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
function ReportsTab(){
  const [reports,setReports]=useState([]); const [loading,setLoading]=useState(true); const [modal,setModal]=useState(null); const [confirm,setConfirm]=useState(null);
  const [fCat,setFCat]=useState("All"); const [fType,setFType]=useState(""); const [fYear,setFYear]=useState(""); const [fMonth,setFMonth]=useState("");
  const [collapsed,setCollapsed]=useState({});
  const toggle=t=>setCollapsed(p=>({...p,[t]:!p[t]}));
  useEffect(()=>{store.get("reports").then(d=>{if(d)setReports(d);setLoading(false);});},[]);
  const persist=async u=>{setReports(u);await store.set("reports",u);};
  const handleSave=async r=>{const u=r.id&&reports.find(x=>x.id===r.id)?reports.map(x=>x.id===r.id?r:x):[...reports,r];await persist(u);setModal(null);};
  const confirmDelete=async()=>{await persist(reports.filter(r=>r.id!==confirm.id));setConfirm(null);};
  const hasF=fType||fYear||fMonth; const years=getYears(reports);
  const filtered=reports.filter(r=>fCat==="All"||r.category===fCat).filter(r=>!fType||r.type===fType).filter(r=>!fYear||r.date?.startsWith(fYear)).filter(r=>!fMonth||r.date?.slice(5,7)===fMonth);
  const anyResult=filtered.length>0;
  // group by type, preserving TYPES order, plus an "Uncategorized" bucket
  const grouped=TYPES.reduce((a,t)=>{a[t]=filtered.filter(r=>r.type===t).sort((x,y)=>(y.date||"").localeCompare(x.date||""));return a;},{});
  const untyped=filtered.filter(r=>!r.type||!TYPES.includes(r.type)).sort((x,y)=>(y.date||"").localeCompare(x.date||""));
  if(loading)return <div style={{textAlign:"center",padding:48,color:C.faint}}>Loading</div>;
  const TypeGroup=({type,color,tint,items})=>items.length>0&&(
    <div style={{marginBottom:12,border:`1px solid ${C.line}`,borderRadius:16,overflow:"hidden",background:C.surface,boxShadow:"0 1px 3px rgba(21,48,43,0.04)"}}>
      <div onClick={()=>toggle(type)} style={{display:"flex",alignItems:"center",gap:9,padding:"11px 16px",cursor:"pointer",userSelect:"none",
        background:tint,borderBottom:collapsed[type]?"none":`1px solid ${C.lineSoft}`}}>
        <span style={{display:"inline-flex",transition:"transform .15s",transform:collapsed[type]?"rotate(-90deg)":"rotate(0deg)",color:C.sub,fontSize:11}}>▾</span>
        <span style={{fontSize:12,fontWeight:700,color,letterSpacing:0.4,textTransform:"uppercase"}}>{type}</span>
        <span style={{fontSize:11,fontWeight:600,color,background:C.surface+"CC",borderRadius:20,padding:"2px 9px"}}>{items.length}</span>
      </div>
      {!collapsed[type]&&(
        <div style={{padding:"12px 14px",display:"flex",flexDirection:"column",gap:10}}>
          {items.map(r=><ReportCard key={r.id} report={r} onEdit={()=>setModal(r)} onDelete={()=>setConfirm({id:r.id,message:"Delete this report?"})}/>)}
        </div>
      )}
    </div>
  );
  return (
    <div>
      <div style={{marginBottom:16}}>
        <CategoryPills value={fCat} onChange={setFCat}/>
      </div>
      <FilterBar filters={hasF} onClear={()=>{setFType("");setFYear("");setFMonth("");}}
        action={<button onClick={()=>setModal("new")} style={s.btn("primary")}>+ Add report</button>}>
        <FilterSelect value={fType} onChange={setFType} options={TYPES} placeholder="All types" minWidth={130}/>
        <FilterSelect value={fYear} onChange={setFYear} options={years} placeholder="All years" minWidth={90}/>
        <FilterSelect value={fMonth} onChange={setFMonth} options={MONTHS} placeholder="All months" minWidth={110}/>
      </FilterBar>
      {reports.length===0?<EmptyState>No reports yet. Upload your first medical report.</EmptyState>
        :!anyResult?<EmptyState>No reports match these filters.</EmptyState>
        :<div>
          {TYPES.map(t=><TypeGroup key={t} type={t} color={TYPE_COLORS[t]} tint={TYPE_TINT[t]} items={grouped[t]}/>)}
          <TypeGroup type="Uncategorized" color={C.faint} tint="#F1F3F2" items={untyped}/>
        </div>}
      {modal&&<ReportModal report={modal==="new"?null:modal} onSave={handleSave} onClose={()=>setModal(null)}/>}
      {confirm&&<ConfirmModal message={confirm.message} onConfirm={confirmDelete} onCancel={()=>setConfirm(null)}/>}
    </div>
  );
}

// ─── Dashboard tab ──────────────────────────────────────────────────────────────
function DashboardTab({onOpenAppt}){
  const [apts,setApts]=useState([]); const [loading,setLoading]=useState(true);
  const year=new Date().getFullYear().toString(); const today=new Date().toISOString().slice(0,10);
  useEffect(()=>{store.get("appointments").then(d=>{if(d)setApts(d);setLoading(false);});},[]);
  const thisYear=apts.filter(a=>a.date?.startsWith(year));
  const totalPaid=thisYear.reduce((s,a)=>s+parseMoney(a.paidAmount),0);
  const totalToPay=thisYear.reduce((s,a)=>s+parseMoney(a.toPayAmount),0);
  const visits=thisYear.length;
  const pending=apts.filter(a=>a.insuranceStatus==="Pending");
  const upcoming=apts.filter(a=>a.date>=today).sort((a,b)=>a.date.localeCompare(b.date)).slice(0,5);
  const byCat=CATEGORIES.map(c=>({cat:c,n:thisYear.filter(a=>a.category===c).length}));
  if(loading)return <div style={{textAlign:"center",padding:48,color:C.faint}}>Loading</div>;

  // Visits split by category — flat tint boxes
  const VisitCell=({cat,n})=>(
    <div style={{flex:"1 1 140px",minWidth:130,borderRadius:14,border:`1px solid ${C.line}`,padding:"14px 15px 15px",background:CAT_TINT[cat]||C.tintBg}}>
      <div style={{fontSize:11,color:CAT_COLORS[cat],fontWeight:700,letterSpacing:0.3,textTransform:"uppercase",marginBottom:8}}>{cat}</div>
      <div style={{fontSize:28,fontWeight:700,color:C.ink,letterSpacing:-1,lineHeight:1}}>{n}</div>
      <div style={{fontSize:11,color:C.sub,marginTop:4}}>{n===1?"visit":"visits"}</div>
    </div>
  );
  // Money / status — flat stat cards
  const MoneyCell=({label,value,color})=>(
    <div style={{flex:"1 1 150px",minWidth:140,...s.card,padding:"14px 16px"}}>
      <div style={{fontSize:11,color:C.faint,fontWeight:600,letterSpacing:0.3,textTransform:"uppercase",marginBottom:8}}>{label}</div>
      <div style={{fontSize:26,fontWeight:700,color,letterSpacing:-1,lineHeight:1}}>{value}</div>
    </div>
  );
  // Minimalist dashboard mini-table
  const miniTh={textAlign:"left",fontSize:10,fontWeight:700,color:C.sub,letterSpacing:0.4,textTransform:"uppercase",padding:"0 10px 8px 0",whiteSpace:"nowrap"};
  const miniTd={textAlign:"left",fontSize:12.5,color:C.ink,padding:"8px 10px 8px 0",whiteSpace:"nowrap"};

  return (
    <div>
      <div style={{fontSize:12.5,color:C.faint,marginBottom:18}}>Year in review · <span style={{color:C.accent,fontWeight:700}}>{year}</span></div>

      {/* Row 1 — visits by category; total lives in the title */}
      <div style={{display:"flex",alignItems:"baseline",gap:10,marginBottom:14}}>
        <span style={{fontSize:15,fontWeight:800,color:C.ink,letterSpacing:-0.3}}>{visits} {visits===1?"visit":"visits"} this year</span>
        <span style={{fontSize:12,color:C.faint}}>by category</span>
      </div>
      <div style={{display:"flex",flexWrap:"wrap",gap:12,marginBottom:24}}>
        {byCat.map(({cat,n})=><VisitCell key={cat} cat={cat} n={n}/>)}
      </div>

      {/* Row 2 — money + pending */}
      <div style={{display:"flex",flexWrap:"wrap",gap:12,marginBottom:24}}>
        <MoneyCell label="Total paid" value={fmtMoney(totalPaid)} color={C.ink}/>
        <MoneyCell label="Total to pay" value={fmtMoney(totalToPay)} color={C.ink}/>
        <MoneyCell label="Pending claims" value={pending.length} color={C.pending}/>
      </div>

      {/* Lists */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
        {/* Pending claims — links back to the appointment */}
        <div style={{...s.card,padding:"16px 18px",minWidth:0}}>
          <div style={{fontSize:11,fontWeight:700,color:C.pending,letterSpacing:0.5,textTransform:"uppercase",marginBottom:10}}>Pending insurance claims</div>
          {pending.length===0?<p style={{fontSize:13,color:C.faint,margin:0}}>Nothing pending.</p>
            :<div style={{overflowX:"auto"}}><table style={{borderCollapse:"collapse",width:"100%"}}>
              <thead><tr>{["Category","Type","Clinic","Date","Amount",""].map(h=><th key={h} style={miniTh}>{h}</th>)}</tr></thead>
              <tbody>
                {pending.map((a,i)=>(
                  <tr key={a.id} style={{borderTop:`1px solid ${C.lineSoft}`}}>
                    <td style={{...miniTd,fontWeight:700,color:CAT_COLORS[a.category]||C.ink,maxWidth:80,overflow:"hidden",textOverflow:"ellipsis"}}>{a.category||"—"}</td>
                    <td style={{...miniTd,color:C.sub,maxWidth:80,overflow:"hidden",textOverflow:"ellipsis"}}>{a.type||"—"}</td>
                    <td style={{...miniTd,color:C.sub,maxWidth:110,overflow:"hidden",textOverflow:"ellipsis"}}>{a.clinic||"—"}</td>
                    <td style={{...miniTd,color:C.sub}}>{fmtShort(a.date)}</td>
                    <td style={{...miniTd}}>{fmtMoney(a.toPayAmount)}</td>
                    <td style={{...miniTd,paddingRight:0}}><button onClick={()=>onOpenAppt&&onOpenAppt(a.id)} style={{background:"none",border:"none",cursor:"pointer",color:C.accent,fontSize:12,fontWeight:600,fontFamily:FONT,padding:0}}>View →</button></td>
                  </tr>
                ))}
              </tbody>
            </table></div>}
        </div>
        {/* Upcoming appointments — minimalist table */}
        <div style={{...s.card,padding:"16px 18px",minWidth:0}}>
          <div style={{fontSize:11,fontWeight:700,color:C.blue,letterSpacing:0.5,textTransform:"uppercase",marginBottom:10}}>Upcoming appointments</div>
          {upcoming.length===0?<p style={{fontSize:13,color:C.faint,margin:0}}>Nothing scheduled.</p>
            :<div style={{overflowX:"auto"}}><table style={{borderCollapse:"collapse",width:"100%"}}>
              <thead><tr>{["Category","Type","Clinic","Date"].map(h=><th key={h} style={miniTh}>{h}</th>)}</tr></thead>
              <tbody>
                {upcoming.map((a,i)=>(
                  <tr key={a.id} style={{borderTop:`1px solid ${C.lineSoft}`}}>
                    <td style={{...miniTd,fontWeight:700,color:CAT_COLORS[a.category]||C.ink,maxWidth:80,overflow:"hidden",textOverflow:"ellipsis"}}>{a.category||"—"}</td>
                    <td style={{...miniTd,color:C.sub,maxWidth:80,overflow:"hidden",textOverflow:"ellipsis"}}>{a.type||"—"}</td>
                    <td style={{...miniTd,color:C.sub,maxWidth:130}}>
                      {a.clinic?<span style={{display:"inline-flex",alignItems:"center",gap:6,maxWidth:130}}>
                        <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.clinic}</span>
                        <a href={mapsUrl(a.clinic)} target="_blank" rel="noreferrer" style={{fontSize:11,color:C.accent,textDecoration:"none",fontWeight:600,flexShrink:0}}>Map</a>
                      </span>:"—"}
                    </td>
                    <td style={{...miniTd,color:C.sub}}>{fmtShort(a.date)}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>}
        </div>
      </div>
    </div>
  );
}

// ─── Login page ─────────────────────────────────────────────────────────────────
function LoginPage({onLogin}){
  const [mode,setMode]=useState("login");
  const [username,setUsername]=useState(""); const [password,setPassword]=useState(""); const [confirm,setConfirm]=useState("");
  const [err,setErr]=useState(""); const [loading,setLoading]=useState(false);
  const reset=()=>{setErr("");setPassword("");setConfirm("");};
const doLogin = async () => {
  if (!username.trim() || !password) { setErr("Enter your email and password."); return; }
  setLoading(true); setErr("");
  const { error } = await supabase.auth.signInWithPassword({
    email: username.trim(), password,
  });
  if (error) { setErr(error.message); setLoading(false); return; }
  onLogin(username.trim());
};
const doSignup = async () => {
  if (!username.trim() || !password) { setErr("Fill in all fields."); return; }
  if (password.length < 6) { setErr("Password must be at least 6 characters."); return; }
  if (password !== confirm) { setErr("Passwords do not match."); return; }
  setLoading(true); setErr("");
  const { error } = await supabase.auth.signUp({
    email: username.trim(), password,
  });
  if (error) { setErr(error.message); setLoading(false); return; }
  onLogin(username.trim());
};
  const go=mode==="login"?doLogin:doSignup;
  return (
    <div style={{minHeight:"100vh",background:C.canvas,display:"flex",alignItems:"center",justifyContent:"center",padding:20,fontFamily:FONT}}>
      <div style={{width:"100%",maxWidth:400}}>
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",textAlign:"center",marginBottom:24}}>
          <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:44,height:44,borderRadius:14,background:C.accent,color:"#fff",marginBottom:14}}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s-7-4.35-9.5-8.5C1 9 2.5 5.5 6 5.5c2 0 3.2 1.2 4 2.5.8-1.3 2-2.5 4-2.5 3.5 0 5 3.5 3.5 7C19 16.65 12 21 12 21Z"/></svg>
          </span>
          <div style={{fontSize:23,fontWeight:800,color:C.ink,letterSpacing:-0.5,marginBottom:5}}>Healthcare Tracker</div>
          <div style={{fontSize:13.5,color:C.sub,maxWidth:280,lineHeight:1.5}}>Your private record of care, coverage, and costs.</div>
        </div>
        <div style={{...s.card,padding:"26px 26px 28px"}}>
          <div style={{display:"flex",gap:8,marginBottom:22,background:C.tintBg,borderRadius:10,padding:4}}>
            {[["login","Sign in"],["signup","Create account"]].map(([m,l])=>(
              <button key={m} onClick={()=>{setMode(m);reset();}} style={{flex:1,padding:"8px 0",border:"none",borderRadius:8,cursor:"pointer",fontFamily:FONT,fontSize:13.5,fontWeight:600,
                background:mode===m?C.surface:"transparent",color:mode===m?C.ink:C.sub,boxShadow:mode===m?"0 1px 2px rgba(21,48,43,0.06)":"none",transition:"all .12s"}}>{l}</button>
            ))}
          </div>
          {err&&<div style={{background:"#FEF2F2",borderRadius:8,padding:"10px 13px",marginBottom:16,fontSize:13,color:C.due}}>{err}</div>}
          <div style={{marginBottom:14}}>
            <label style={s.label}>Username</label>
            <SI value={username} onChange={setUsername} placeholder="Enter username"/>
          </div>
          <div style={{marginBottom:mode==="signup"?14:22}}>
            <label style={s.label}>Password</label>
            <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Enter password" style={s.input} onKeyDown={e=>e.key==="Enter"&&go()}/>
          </div>
          {mode==="signup"&&<div style={{marginBottom:22}}>
            <label style={s.label}>Confirm password</label>
            <input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} placeholder="Re-enter password" style={s.input} onKeyDown={e=>e.key==="Enter"&&go()}/>
          </div>}
          <button onClick={go} disabled={loading} style={{...s.btn("primary"),width:"100%",padding:"12px",fontSize:14,opacity:loading?0.7:1,cursor:loading?"not-allowed":"pointer"}}>{loading?"Please wait":mode==="login"?"Sign in":"Create account"}</button>
          {mode==="signup"&&<p style={{margin:"14px 0 0",fontSize:12,color:C.faint,textAlign:"center"}}>Your data is private and tied to your account.</p>}
        </div>
      </div>
    </div>
  );
}

// ─── App shell ──────────────────────────────────────────────────────────────────
const TABS=[{id:"dashboard",label:"Dashboard"},{id:"appointments",label:"Appointments"},{id:"insurance",label:"Insurance"},{id:"clinics",label:"Clinics"},{id:"reports",label:"Reports"}];
export default function App(){
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState("dashboard");
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user?.email || null);
      setChecking(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, sess) => {
      setUser(sess?.user?.email || null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);
  if (checking) return <div style={{minHeight:"100vh",background:C.canvas}}/>;
  if (!user) return <LoginPage onLogin={u=>{setUser(u);setTab("dashboard");}}/>;
  return (
    <div style={{minHeight:"100vh",background:C.canvas,fontFamily:FONT,color:C.ink}}>
      {/* Top bar */}
      <div style={{borderBottom:`1px solid ${C.line}`,background:C.surface}}>
        <div style={{maxWidth:1040,margin:"0 auto",padding:"16px 24px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:28,height:28,borderRadius:9,background:C.accent,color:"#fff",flexShrink:0}}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s-7-4.35-9.5-8.5C1 9 2.5 5.5 6 5.5c2 0 3.2 1.2 4 2.5.8-1.3 2-2.5 4-2.5 3.5 0 5 3.5 3.5 7C19 16.65 12 21 12 21Z"/></svg>
            </span>
            <span style={{fontSize:16,fontWeight:800,letterSpacing:-0.3,color:C.ink}}>Healthcare Tracker</span>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:14}}>
            <span style={{fontSize:13,color:C.sub,fontWeight:500}}>{user}</span>
            <button onClick={async () => { await supabase.auth.signOut(); setUser(null); }} style={{padding:"7px 14px",borderRadius:20,border:`1px solid ${C.line}`,background:C.surface,color:C.sub,cursor:"pointer",fontSize:12.5,fontFamily:FONT,fontWeight:600}}>Sign out</button>
          </div>
        </div>
      </div>
      {/* Nav */}
      <div style={{borderBottom:`1px solid ${C.line}`,background:C.surface,position:"sticky",top:0,zIndex:50}}>
        <div style={{maxWidth:1040,margin:"0 auto",padding:"0 24px",display:"flex",gap:4,overflowX:"auto"}}>
          {TABS.map(t=>{const active=tab===t.id;return(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{padding:"14px 4px",marginRight:22,border:"none",background:"none",cursor:"pointer",fontFamily:FONT,fontSize:13.5,fontWeight:active?700:500,
              color:active?C.accent:C.sub,borderBottom:`2.5px solid ${active?C.accent:"transparent"}`,whiteSpace:"nowrap",transition:"color .12s"}}>{t.label}</button>
          );})}
        </div>
      </div>
      {/* Content */}
      <div style={{maxWidth:1040,margin:"0 auto",padding:"32px 24px 64px"}}>
        {tab==="dashboard"&&<DashboardTab onOpenAppt={()=>setTab("appointments")}/>}
        {tab==="appointments"&&<AppointmentsTab/>}
        {tab==="reports"&&<ReportsTab/>}
        {tab==="insurance"&&<InsuranceTab/>}
        {tab==="clinics"&&<ClinicsTab/>}
      </div>
    </div>
  );
}

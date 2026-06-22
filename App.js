import { useState, useEffect, useCallback } from "react";

const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL;
const SUPABASE_ANON = process.env.REACT_APP_SUPABASE_ANON;
const ADMIN_EMAIL = process.env.REACT_APP_ADMIN_EMAIL;
const ADMIN_EMAILS = ADMIN_EMAIL
  ? ADMIN_EMAIL.split(",").map(e=>e.trim())
  : ["veritarea@gmail.com", "admin@gmail.com"];

const SOURCES = {
  gyocharo:    { label: "교차로",    color: "#f5c400" },
  oiljang:     { label: "오일장",    color: "#0077b6" },
  oiljang_line:{ label: "줄광고",    color: "#023e8a" },
  daangn:      { label: "당근",      color: "#ff6900" },
};

const STATUS_CONFIG = {
  new:       { label: "신규",    color: "#22c55e", bg: "#052e16" },
  called:    { label: "연락완료", color: "#3b82f6", bg: "#0c1a2e" },
  callback:  { label: "콜백예정", color: "#f59e0b", bg: "#2d1f00" },
  acquired:  { label: "물건확보", color: "#a78bfa", bg: "#1e1030" },
  rejected:  { label: "거절",    color: "#ef4444", bg: "#2d0f0f" },
  duplicate: { label: "중복",    color: "#9ca3af", bg: "#111" },
};

async function sbFetch(path, opts = {}, token = null) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const res = await fetch(url, {
    method: opts.method || "GET",
    cache: "no-store",
    headers: {
      "apikey": SUPABASE_ANON,
      "Authorization": `Bearer ${token || SUPABASE_ANON}`,
      "Content-Type": "application/json",
      "Prefer": opts.method === "PATCH" || opts.method === "DELETE" ? "return=minimal" : "return=representation",
    },
    body: opts.body,
  });
  if (!res.ok) throw new Error(await res.text());
  const t = await res.text();
  return t ? JSON.parse(t) : [];
}

async function sbAuth(action, email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/${action}`, {
    method: "POST",
    headers: { "apikey": SUPABASE_ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.msg || "인증 오류");
  return data;
}

async function sbAdminCreateUser(email, password, token) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      "apikey": SUPABASE_ANON,
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.msg || "계정 생성 실패");
  return data;
}

function timeAgo(d) {
  const s = (Date.now() - new Date(d)) / 1000;
  if (s < 60)    return "방금";
  if (s < 3600)  return `${Math.floor(s/60)}분 전`;
  if (s < 86400) return `${Math.floor(s/3600)}시간 전`;
  return `${Math.floor(s/86400)}일 전`;
}

// ── 통계 대시보드 ──
function StatBox({ label, value, color, sub }) {
  return (
    <div style={{ background:"#161b22", border:"1px solid #21262d", borderRadius:10, padding:"16px 18px", flex:1, minWidth:140 }}>
      <div style={{ fontSize:11, color:"#6e7681", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.6px", marginBottom:8 }}>{label}</div>
      <div style={{ fontSize:28, fontWeight:800, color:color||"#e6edf3", lineHeight:1 }}>{value}</div>
      {sub && <div style={{ fontSize:11, color:"#6e7681", marginTop:6 }}>{sub}</div>}
    </div>
  );
}

function BarRow({ label, count, total, color }) {
  const pct = total>0 ? Math.round((count/total)*100) : 0;
  return (
    <div style={{ marginBottom:10 }}>
      <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, color:"#8b949e", marginBottom:4 }}>
        <span>{label}</span>
        <span style={{ color:"#e6edf3", fontWeight:600 }}>{count}건 ({pct}%)</span>
      </div>
      <div style={{ background:"#21262d", borderRadius:4, height:8, overflow:"hidden" }}>
        <div style={{ background:color, width:`${pct}%`, height:"100%", borderRadius:4, transition:"width 0.3s" }}/>
      </div>
    </div>
  );
}

function StatsPanel({ leads, today }) {
  const total = leads.length;

  // 소스별 집계
  const bySource = Object.keys(SOURCES).map(key => ({
    key, label: SOURCES[key].label, color: SOURCES[key].color,
    count: leads.filter(l=>l.source===key).length,
  }));

  // 상태별 집계
  const byStatus = Object.keys(STATUS_CONFIG).map(key => ({
    key, label: STATUS_CONFIG[key].label, color: STATUS_CONFIG[key].color,
    count: leads.filter(l=>l.status===key).length,
  }));

  // 지역별 집계
  const AREA_KEYS = ["노형동", "연동"];
  const byArea = AREA_KEYS.map(area => ({
    label: area,
    count: leads.filter(l=>(l.address_jibun||l.address_raw||"").includes(area)).length,
  }));
  const otherArea = total - byArea.reduce((s,a)=>s+a.count,0);

  // 담당자별 확보 현황
  const assignees = {};
  leads.forEach(l=>{
    if (l.assigned_to) assignees[l.assigned_to] = (assignees[l.assigned_to]||0)+1;
  });
  const assigneeList = Object.entries(assignees).sort((a,b)=>b[1]-a[1]);

  // 최근 7일 수집 추이
  const days = [];
  for (let i=6;i>=0;i--) {
    const d = new Date();
    d.setDate(d.getDate()-i);
    const key = d.toISOString().slice(0,10);
    const label = d.toLocaleDateString('ko-KR',{month:'numeric',day:'numeric'});
    const count = leads.filter(l=>l.collected_at?.startsWith(key)).length;
    days.push({ key, label, count });
  }
  const maxDayCount = Math.max(...days.map(d=>d.count), 1);

  // 전화번호 보유율
  const withPhone = leads.filter(l=>l.phone && l.phone !== "📞연락처있음" ? true : !!l.phone).length;
  const acquiredCount = leads.filter(l=>l.status==="acquired").length;
  const todayCount = leads.filter(l=>l.collected_at?.startsWith(today)).length;

  return (
    <div style={{ flex:1, overflowY:"auto", padding:"20px 24px", height:"calc(100vh - 52px)", boxSizing:"border-box" }}>
      {/* 상단 요약 카드 */}
      <div style={{ display:"flex", gap:12, flexWrap:"wrap", marginBottom:24 }}>
        <StatBox label="전체 매물" value={total} />
        <StatBox label="오늘 수집" value={todayCount} color="#f48c06" />
        <StatBox label="물건확보" value={acquiredCount} color="#a78bfa" sub={total>0?`전체의 ${Math.round(acquiredCount/total*100)}%`:""} />
        <StatBox label="연락처 확보" value={withPhone} color="#22c55e" sub={total>0?`전체의 ${Math.round(withPhone/total*100)}%`:""} />
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>
        {/* 소스별 분포 */}
        <div style={{ background:"#161b22", border:"1px solid #21262d", borderRadius:10, padding:18 }}>
          <div style={{ fontSize:13, fontWeight:700, marginBottom:14 }}>📡 소스별 수집 현황</div>
          {bySource.map(s=>(
            <BarRow key={s.key} label={s.label} count={s.count} total={total} color={s.color}/>
          ))}
        </div>

        {/* 상태별 분포 */}
        <div style={{ background:"#161b22", border:"1px solid #21262d", borderRadius:10, padding:18 }}>
          <div style={{ fontSize:13, fontWeight:700, marginBottom:14 }}>📌 상태별 분포</div>
          {byStatus.map(s=>(
            <BarRow key={s.key} label={s.label} count={s.count} total={total} color={s.color}/>
          ))}
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>
        {/* 지역별 분포 */}
        <div style={{ background:"#161b22", border:"1px solid #21262d", borderRadius:10, padding:18 }}>
          <div style={{ fontSize:13, fontWeight:700, marginBottom:14 }}>📍 지역별 분포</div>
          {byArea.map(a=>(
            <BarRow key={a.label} label={a.label} count={a.count} total={total} color="#388bfd"/>
          ))}
          {otherArea > 0 && <BarRow label="기타" count={otherArea} total={total} color="#6e7681"/>}
        </div>

        {/* 담당자별 확보 현황 */}
        <div style={{ background:"#161b22", border:"1px solid #21262d", borderRadius:10, padding:18 }}>
          <div style={{ fontSize:13, fontWeight:700, marginBottom:14 }}>🔒 담당자별 물건확보</div>
          {assigneeList.length===0 && <div style={{ fontSize:12, color:"#6e7681" }}>아직 확보된 매물이 없습니다</div>}
          {assigneeList.map(([name,count])=>(
            <BarRow key={name} label={name} count={count} total={acquiredCount||1} color="#a78bfa"/>
          ))}
        </div>
      </div>

      {/* 최근 7일 수집 추이 */}
      <div style={{ background:"#161b22", border:"1px solid #21262d", borderRadius:10, padding:18 }}>
        <div style={{ fontSize:13, fontWeight:700, marginBottom:16 }}>📈 최근 7일 수집 추이</div>
        <div style={{ display:"flex", alignItems:"flex-end", gap:10, height:120 }}>
          {days.map(d=>(
            <div key={d.key} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:6 }}>
              <div style={{ fontSize:11, color:"#e6edf3", fontWeight:700 }}>{d.count}</div>
              <div style={{ width:"100%", background:"linear-gradient(180deg,#f48c06,#e85d04)", borderRadius:"4px 4px 0 0", height:`${Math.max((d.count/maxDayCount)*90,d.count>0?6:2)}px`, transition:"height 0.3s" }}/>
              <div style={{ fontSize:10, color:"#6e7681" }}>{d.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── 브리핑 패널 ──
function BriefingPanel({ user, leads }) {
  const [briefings, setBriefings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [resultModal, setResultModal] = useState(null);
  const [resultText, setResultText] = useState("");
  const [form, setForm] = useState({
    scheduled_at:"", address:"", price:"", maintenance_fee:"",
    available_date:"", door_password:"", assigned_to:"", note:"", lead_id:""
  });

  const today = new Date().toISOString().slice(0,10);

  const loadBriefings = async () => {
    setLoading(true);
    try {
      const data = await sbFetch("briefings?select=*&order=scheduled_at.asc", {}, user.token);
      setBriefings(Array.isArray(data) ? data : []);
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadBriefings(); }, []);

  const handleLeadSelect = (e) => {
    const lead = leads.find(l=>l.id===e.target.value);
    if (lead) {
      setForm(f=>({ ...f, lead_id:lead.id, address:lead.address_raw||"", price:lead.price||"" }));
    } else {
      setForm(f=>({ ...f, lead_id:"" }));
    }
  };

  const handleSubmit = async () => {
    if (!form.scheduled_at || !form.address) return alert("일시와 주소는 필수입니다.");
    try {
      if (editItem) {
        await sbFetch(`briefings?id=eq.${editItem.id}`, { method:"PATCH", body:JSON.stringify({...form, created_by:user.name}) }, user.token);
      } else {
        await sbFetch("briefings", { method:"POST", body:JSON.stringify({...form, created_by:user.name, status:"scheduled"}) }, user.token);
      }
      setShowForm(false); setEditItem(null);
      setForm({ scheduled_at:"", address:"", price:"", maintenance_fee:"", available_date:"", door_password:"", assigned_to:"", note:"", lead_id:"" });
      loadBriefings();
    } catch(e) { alert("저장 오류: "+e.message); }
  };

  const handleStatus = async (id, status) => {
    await sbFetch(`briefings?id=eq.${id}`, { method:"PATCH", body:JSON.stringify({status}) }, user.token);
    loadBriefings();
  };

  const handleResult = async () => {
    await sbFetch(`briefings?id=eq.${resultModal.id}`, { method:"PATCH", body:JSON.stringify({result:resultText, status:"done"}) }, user.token);
    setResultModal(null); setResultText("");
    loadBriefings();
  };

  const handleDelete = async (id) => {
    if (!window.confirm("삭제하시겠습니까?")) return;
    await sbFetch(`briefings?id=eq.${id}`, { method:"DELETE" }, user.token);
    loadBriefings();
  };

  const canSeePw = (b) => user.isAdmin || b.assigned_to === user.name;

  // 날짜별 그룹핑
  const grouped = {};
  briefings.forEach(b => {
    const d = b.scheduled_at?.slice(0,10) || "미정";
    if (!grouped[d]) grouped[d] = [];
    grouped[d].push(b);
  });

  const formatTime = (dt) => {
    if (!dt) return "";
    const d = new Date(dt);
    return d.toLocaleTimeString('ko-KR', { hour:'2-digit', minute:'2-digit', hour12:true });
  };

  const formatDate = (d) => {
    if (!d) return "미정";
    const dt = new Date(d+"T00:00:00");
    const diff = Math.round((dt - new Date(today+"T00:00:00")) / 86400000);
    const label = diff===0?"오늘":diff===1?"내일":diff===-1?"어제":"";
    return dt.toLocaleDateString('ko-KR',{month:'long',day:'numeric',weekday:'short'}) + (label?" ("+label+")":"");
  };

  const statusColor = { scheduled:"#3b82f6", done:"#22c55e", cancelled:"#6e7681" };
  const statusLabel = { scheduled:"예정", done:"완료", cancelled:"취소" };

  return (
    <div style={{ flex:1, overflowY:"auto", padding:"20px 24px", height:"calc(100vh - 52px)", boxSizing:"border-box" }}>
      {/* 상단 헤더 */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <div>
          <div style={{ fontSize:16, fontWeight:700 }}>📅 브리핑 일정</div>
          <div style={{ fontSize:12, color:"#6e7681", marginTop:2 }}>총 {briefings.filter(b=>b.status==="scheduled").length}건 예정</div>
        </div>
        {user.isAdmin && (
          <button onClick={()=>{ setShowForm(true); setEditItem(null); setForm({ scheduled_at:"", address:"", price:"", maintenance_fee:"", available_date:"", door_password:"", assigned_to:"", note:"", lead_id:"" }); }} style={{ background:"linear-gradient(135deg,#e85d04,#f48c06)", color:"#fff", border:"none", borderRadius:8, padding:"8px 16px", fontSize:13, fontWeight:700, cursor:"pointer" }}>
            + 브리핑 등록
          </button>
        )}
      </div>

      {/* 등록/수정 폼 */}
      {showForm && (
        <div style={{ background:"#161b22", border:"1px solid #30363d", borderRadius:12, padding:20, marginBottom:20 }}>
          <div style={{ fontSize:14, fontWeight:700, marginBottom:16 }}>{editItem?"브리핑 수정":"브리핑 등록"}</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <div>
              <div style={{ fontSize:11, color:"#6e7681", marginBottom:4 }}>일시 *</div>
              <input type="datetime-local" value={form.scheduled_at} onChange={e=>setForm(f=>({...f,scheduled_at:e.target.value}))} style={{ width:"100%", background:"#0d1117", border:"1px solid #30363d", borderRadius:6, padding:"7px 10px", color:"#e6edf3", fontSize:13 }}/>
            </div>
            <div>
              <div style={{ fontSize:11, color:"#6e7681", marginBottom:4 }}>담당 직원</div>
              <input value={form.assigned_to} onChange={e=>setForm(f=>({...f,assigned_to:e.target.value}))} placeholder="이름 입력" style={{ width:"100%", background:"#0d1117", border:"1px solid #30363d", borderRadius:6, padding:"7px 10px", color:"#e6edf3", fontSize:13 }}/>
            </div>
            <div style={{ gridColumn:"1/-1" }}>
              <div style={{ fontSize:11, color:"#6e7681", marginBottom:4 }}>수집 매물에서 선택 (선택사항)</div>
              <select onChange={handleLeadSelect} style={{ width:"100%", background:"#0d1117", border:"1px solid #30363d", borderRadius:6, padding:"7px 10px", color:"#e6edf3", fontSize:13 }}>
                <option value="">직접 입력</option>
                {leads.filter(l=>l.address_raw).map(l=>(
                  <option key={l.id} value={l.id}>{l.address_raw?.slice(0,40)} {l.price?"| "+l.price:""}</option>
                ))}
              </select>
            </div>
            <div style={{ gridColumn:"1/-1" }}>
              <div style={{ fontSize:11, color:"#6e7681", marginBottom:4 }}>주소 *</div>
              <input value={form.address} onChange={e=>setForm(f=>({...f,address:e.target.value}))} placeholder="주소 입력" style={{ width:"100%", background:"#0d1117", border:"1px solid #30363d", borderRadius:6, padding:"7px 10px", color:"#e6edf3", fontSize:13 }}/>
            </div>
            <div>
              <div style={{ fontSize:11, color:"#6e7681", marginBottom:4 }}>금액</div>
              <input value={form.price} onChange={e=>setForm(f=>({...f,price:e.target.value}))} placeholder="예: 보증금 500/월세 45" style={{ width:"100%", background:"#0d1117", border:"1px solid #30363d", borderRadius:6, padding:"7px 10px", color:"#e6edf3", fontSize:13 }}/>
            </div>
            <div>
              <div style={{ fontSize:11, color:"#6e7681", marginBottom:4 }}>관리비</div>
              <input value={form.maintenance_fee} onChange={e=>setForm(f=>({...f,maintenance_fee:e.target.value}))} placeholder="예: 5만원 (인터넷 포함)" style={{ width:"100%", background:"#0d1117", border:"1px solid #30363d", borderRadius:6, padding:"7px 10px", color:"#e6edf3", fontSize:13 }}/>
            </div>
            <div>
              <div style={{ fontSize:11, color:"#6e7681", marginBottom:4 }}>입주가능일</div>
              <input value={form.available_date} onChange={e=>setForm(f=>({...f,available_date:e.target.value}))} placeholder="예: 즉시입주 / 2026.07.01" style={{ width:"100%", background:"#0d1117", border:"1px solid #30363d", borderRadius:6, padding:"7px 10px", color:"#e6edf3", fontSize:13 }}/>
            </div>
            <div>
              <div style={{ fontSize:11, color:"#6e7681", marginBottom:4 }}>🔐 비밀번호</div>
              <input value={form.door_password} onChange={e=>setForm(f=>({...f,door_password:e.target.value}))} placeholder="도어락 비밀번호" style={{ width:"100%", background:"#0d1117", border:"1px solid #f48c06", borderRadius:6, padding:"7px 10px", color:"#f48c06", fontSize:13 }}/>
            </div>
            <div style={{ gridColumn:"1/-1" }}>
              <div style={{ fontSize:11, color:"#6e7681", marginBottom:4 }}>추가 메모</div>
              <textarea value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))} rows={2} placeholder="특이사항, 주차 안내 등" style={{ width:"100%", background:"#0d1117", border:"1px solid #30363d", borderRadius:6, padding:"7px 10px", color:"#e6edf3", fontSize:13, resize:"vertical" }}/>
            </div>
          </div>
          <div style={{ display:"flex", gap:8, marginTop:14 }}>
            <button onClick={handleSubmit} style={{ background:"linear-gradient(135deg,#e85d04,#f48c06)", color:"#fff", border:"none", borderRadius:6, padding:"8px 18px", fontSize:13, fontWeight:700, cursor:"pointer" }}>저장</button>
            <button onClick={()=>{ setShowForm(false); setEditItem(null); }} style={{ background:"transparent", border:"1px solid #30363d", color:"#8b949e", borderRadius:6, padding:"8px 14px", fontSize:13, cursor:"pointer" }}>취소</button>
          </div>
        </div>
      )}

      {/* 날짜별 브리핑 목록 */}
      {Object.keys(grouped).sort().map(date => (
        <div key={date} style={{ marginBottom:24 }}>
          <div style={{ fontSize:12, fontWeight:700, color:"#f48c06", marginBottom:10, display:"flex", alignItems:"center", gap:8 }}>
            <span>{formatDate(date)}</span>
            <span style={{ color:"#6e7681", fontWeight:400 }}>({grouped[date].length}건)</span>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {grouped[date].map(b => (
              <div key={b.id} style={{ background:"#161b22", border:`1px solid ${b.status==="done"?"#1a3a1a":b.status==="cancelled"?"#21262d":"#21262d"}`, borderLeft:`3px solid ${statusColor[b.status]||"#30363d"}`, borderRadius:10, padding:16, opacity:b.status==="cancelled"?0.5:1 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <div style={{ fontSize:18, fontWeight:800, color:"#e6edf3" }}>{formatTime(b.scheduled_at)}</div>
                    <span style={{ fontSize:10, background:statusColor[b.status]+"22", color:statusColor[b.status], padding:"2px 8px", borderRadius:10, fontWeight:600 }}>{statusLabel[b.status]}</span>
                    {b.assigned_to && <span style={{ fontSize:12, color:"#8b949e" }}>👤 {b.assigned_to}</span>}
                  </div>
                  {(user.isAdmin || b.assigned_to===user.name) && (
                    <div style={{ display:"flex", gap:6 }}>
                      {b.status==="scheduled" && (
                        <>
                          <button onClick={()=>{ setResultModal(b); setResultText(b.result||""); }} style={{ background:"#22c55e22", color:"#22c55e", border:"1px solid #22c55e44", borderRadius:6, padding:"4px 10px", fontSize:11, cursor:"pointer", fontWeight:600 }}>완료</button>
                          <button onClick={()=>handleStatus(b.id,"cancelled")} style={{ background:"transparent", color:"#6e7681", border:"1px solid #30363d", borderRadius:6, padding:"4px 10px", fontSize:11, cursor:"pointer" }}>취소</button>
                        </>
                      )}
                      {user.isAdmin && (
                        <>
                          <button onClick={()=>{ setEditItem(b); setForm({scheduled_at:b.scheduled_at?.slice(0,16)||"", address:b.address||"", price:b.price||"", maintenance_fee:b.maintenance_fee||"", available_date:b.available_date||"", door_password:b.door_password||"", assigned_to:b.assigned_to||"", note:b.note||"", lead_id:b.lead_id||""}); setShowForm(true); }} style={{ background:"transparent", color:"#8b949e", border:"1px solid #30363d", borderRadius:6, padding:"4px 10px", fontSize:11, cursor:"pointer" }}>수정</button>
                          <button onClick={()=>handleDelete(b.id)} style={{ background:"transparent", color:"#ef4444", border:"1px solid #ef444444", borderRadius:6, padding:"4px 10px", fontSize:11, cursor:"pointer" }}>삭제</button>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* 브리핑 정보 카드 */}
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:8 }}>
                  <div style={{ background:"#0d1117", borderRadius:6, padding:"8px 12px" }}>
                    <div style={{ fontSize:10, color:"#6e7681", marginBottom:3 }}>📍 주소</div>
                    <div style={{ fontSize:12, color:"#e6edf3", fontWeight:600, lineHeight:1.4 }}>{b.address}</div>
                  </div>
                  {b.price && (
                    <div style={{ background:"#0d1117", borderRadius:6, padding:"8px 12px" }}>
                      <div style={{ fontSize:10, color:"#6e7681", marginBottom:3 }}>💰 금액</div>
                      <div style={{ fontSize:12, color:"#f48c06", fontWeight:600 }}>{b.price}</div>
                    </div>
                  )}
                  {b.maintenance_fee && (
                    <div style={{ background:"#0d1117", borderRadius:6, padding:"8px 12px" }}>
                      <div style={{ fontSize:10, color:"#6e7681", marginBottom:3 }}>🏠 관리비</div>
                      <div style={{ fontSize:12, color:"#e6edf3" }}>{b.maintenance_fee}</div>
                    </div>
                  )}
                  {b.available_date && (
                    <div style={{ background:"#0d1117", borderRadius:6, padding:"8px 12px" }}>
                      <div style={{ fontSize:10, color:"#6e7681", marginBottom:3 }}>📆 입주가능일</div>
                      <div style={{ fontSize:12, color:"#e6edf3" }}>{b.available_date}</div>
                    </div>
                  )}
                  <div style={{ background: canSeePw(b)?"#1a1206":"#0d1117", border: canSeePw(b)?"1px solid #f48c0633":"none", borderRadius:6, padding:"8px 12px" }}>
                    <div style={{ fontSize:10, color:"#6e7681", marginBottom:3 }}>🔐 비밀번호</div>
                    <div style={{ fontSize:13, color: canSeePw(b)?"#f48c06":"#30363d", fontWeight:700, letterSpacing:2 }}>
                      {b.door_password ? (canSeePw(b) ? b.door_password : "••••••") : "-"}
                    </div>
                  </div>
                </div>

                {b.note && (
                  <div style={{ marginTop:8, background:"#0d1117", borderRadius:6, padding:"8px 12px", fontSize:12, color:"#8b949e" }}>
                    💬 {b.note}
                  </div>
                )}
                {b.result && (
                  <div style={{ marginTop:8, background:"#052e16", borderRadius:6, padding:"8px 12px", fontSize:12, color:"#22c55e" }}>
                    ✅ 결과: {b.result}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {briefings.length === 0 && !loading && (
        <div style={{ textAlign:"center", padding:"60px 0", color:"#6e7681", fontSize:13 }}>
          등록된 브리핑 일정이 없습니다
        </div>
      )}

      {/* 결과 메모 모달 */}
      {resultModal && (
        <div style={{ position:"fixed", inset:0, background:"#000000aa", display:"flex", alignItems:"center", justifyContent:"center", zIndex:999 }}>
          <div style={{ background:"#161b22", border:"1px solid #30363d", borderRadius:12, padding:24, width:400 }}>
            <div style={{ fontSize:14, fontWeight:700, marginBottom:12 }}>✅ 브리핑 완료 처리</div>
            <div style={{ fontSize:12, color:"#6e7681", marginBottom:8 }}>{resultModal.address}</div>
            <textarea value={resultText} onChange={e=>setResultText(e.target.value)} rows={4} placeholder="브리핑 결과를 입력하세요&#10;(예: 고객 관심 있음, 재방문 예정)" style={{ width:"100%", background:"#0d1117", border:"1px solid #30363d", borderRadius:6, padding:"10px", color:"#e6edf3", fontSize:13, resize:"vertical", boxSizing:"border-box" }}/>
            <div style={{ display:"flex", gap:8, marginTop:12 }}>
              <button onClick={handleResult} style={{ background:"#22c55e", color:"#fff", border:"none", borderRadius:6, padding:"8px 18px", fontSize:13, fontWeight:700, cursor:"pointer" }}>저장</button>
              <button onClick={()=>{ setResultModal(null); setResultText(""); }} style={{ background:"transparent", border:"1px solid #30363d", color:"#8b949e", borderRadius:6, padding:"8px 14px", fontSize:13, cursor:"pointer" }}>취소</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 로그인 화면 ──
function LoginPage({ onLogin }) {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  async function handleLogin() {
    if (!email || !password) return;
    setLoading(true); setError("");
    try {
      const data = await sbAuth("token?grant_type=password", email, password);
      const allowed = await sbFetch(`allowed_users?email=eq.${encodeURIComponent(email)}&select=email,name`);
      if (!allowed || allowed.length === 0) throw new Error("접근 권한이 없습니다. 관리자에게 문의하세요.");
      onLogin({ token: data.access_token, refresh_token: data.refresh_token, email, name: allowed[0].name || email.split("@")[0], isAdmin: ADMIN_EMAILS.includes(email) });
    } catch(e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ fontFamily:"'Noto Sans KR',sans-serif", background:"#0d1117", minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&display=swap" rel="stylesheet"/>
      <div style={{ width:360, background:"#161b22", border:"1px solid #21262d", borderRadius:12, padding:32 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:28 }}>
          <div style={{ width:36, height:36, background:"linear-gradient(135deg,#e85d04,#f48c06)", borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, fontWeight:700, color:"#fff" }}>V</div>
          <div>
            <div style={{ fontWeight:700, fontSize:16, color:"#e6edf3" }}>Verita</div>
            <div style={{ fontSize:11, color:"#6e7681" }}>매물 수집 시스템</div>
          </div>
        </div>
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:12, color:"#8b949e", marginBottom:6 }}>이메일</div>
          <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="이메일 입력"
            style={{ width:"100%", boxSizing:"border-box", background:"#0d1117", border:"1px solid #30363d", borderRadius:6, padding:"9px 12px", color:"#e6edf3", fontSize:13, outline:"none" }}
          />
        </div>
        <div style={{ marginBottom:20 }}>
          <div style={{ fontSize:12, color:"#8b949e", marginBottom:6 }}>비밀번호</div>
          <input value={password} onChange={e=>setPassword(e.target.value)} type="password" placeholder="비밀번호 입력"
            onKeyDown={e=>e.key==="Enter"&&handleLogin()}
            style={{ width:"100%", boxSizing:"border-box", background:"#0d1117", border:"1px solid #30363d", borderRadius:6, padding:"9px 12px", color:"#e6edf3", fontSize:13, outline:"none" }}
          />
        </div>
        {error && <div style={{ background:"#2d0f0f", border:"1px solid #7f1d1d", borderRadius:6, padding:"8px 12px", fontSize:12, color:"#fca5a5", marginBottom:14 }}>{error}</div>}
        <button onClick={handleLogin} disabled={loading}
          style={{ width:"100%", background:loading?"#21262d":"linear-gradient(135deg,#e85d04,#f48c06)", color:"#fff", border:"none", borderRadius:7, padding:"11px 0", fontSize:14, fontWeight:700, cursor:loading?"not-allowed":"pointer" }}>
          {loading ? "로그인 중..." : "로그인"}
        </button>
        <div style={{ marginTop:14, fontSize:11, color:"#6e7681", textAlign:"center" }}>계정이 없으면 관리자에게 문의하세요</div>
      </div>
    </div>
  );
}

// ── 관리자 페이지 ──
function AdminPage({ user, onBack }) {
  const [users, setUsers]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [newEmail, setNewEmail]   = useState("");
  const [newName, setNewName]     = useState("");
  const [newPw, setNewPw]         = useState("");
  const [creating, setCreating]   = useState(false);
  const [error, setError]         = useState("");
  const [success, setSuccess]     = useState("");

  useEffect(() => { loadUsers(); }, []);

  async function loadUsers() {
    setLoading(true);
    try {
      const data = await sbFetch("allowed_users?select=*&order=created_at.desc", {}, user.token);
      setUsers(data);
    } catch(e) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function createUser() {
    if (!newEmail || !newPw || !newName) { setError("이름, 이메일, 비밀번호 모두 입력하세요"); return; }
    setCreating(true); setError(""); setSuccess("");
    try {
      // 1. allowed_users에 추가
      await sbFetch("allowed_users", { method:"POST", body:JSON.stringify({ email:newEmail, name:newName }) }, user.token);
      // 2. Supabase Auth에 계정 생성 시도 (실패해도 allowed_users는 추가됨)
      try {
        await sbAdminCreateUser(newEmail, newPw, user.token);
      } catch(e) {
        // admin API 권한 없으면 일반 signup으로 fallback
        await sbAuth("signup", newEmail, newPw);
      }
      setSuccess(`✅ ${newName} (${newEmail}) 계정 생성 완료! 비밀번호: ${newPw}`);
      setNewEmail(""); setNewName(""); setNewPw("");
      loadUsers();
    } catch(e) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  }

  async function deleteUser(email) {
    if (!window.confirm(`${email} 계정을 삭제할까요?`)) return;
    try {
      await sbFetch(`allowed_users?email=eq.${encodeURIComponent(email)}`, { method:"DELETE" }, user.token);
      loadUsers();
    } catch(e) { setError(e.message); }
  }

  return (
    <div style={{ fontFamily:"'Noto Sans KR',sans-serif", background:"#0d1117", minHeight:"100vh", color:"#e6edf3" }}>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&display=swap" rel="stylesheet"/>
      <div style={{ background:"#161b22", borderBottom:"1px solid #21262d", padding:"0 24px", display:"flex", alignItems:"center", justifyContent:"space-between", height:52 }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <button onClick={onBack} style={{ background:"none", border:"1px solid #30363d", color:"#8b949e", borderRadius:6, padding:"5px 12px", fontSize:12, cursor:"pointer" }}>← 돌아가기</button>
          <span style={{ fontWeight:700, fontSize:14 }}>관리자 페이지</span>
        </div>
        <span style={{ fontSize:12, color:"#6e7681" }}>👤 {user.name}</span>
      </div>

      <div style={{ maxWidth:600, margin:"40px auto", padding:"0 20px" }}>
        {/* 계정 생성 */}
        <div style={{ background:"#161b22", border:"1px solid #21262d", borderRadius:10, padding:24, marginBottom:24 }}>
          <div style={{ fontWeight:700, fontSize:15, marginBottom:18 }}>새 계정 생성</div>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
            <div>
              <div style={{ fontSize:11, color:"#6e7681", marginBottom:6 }}>이름</div>
              <input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="홍길동"
                style={{ width:"100%", boxSizing:"border-box", background:"#0d1117", border:"1px solid #30363d", borderRadius:6, padding:"8px 10px", color:"#e6edf3", fontSize:12, outline:"none" }}
              />
            </div>
            <div>
              <div style={{ fontSize:11, color:"#6e7681", marginBottom:6 }}>이메일</div>
              <input value={newEmail} onChange={e=>setNewEmail(e.target.value)} placeholder="email@gmail.com"
                style={{ width:"100%", boxSizing:"border-box", background:"#0d1117", border:"1px solid #30363d", borderRadius:6, padding:"8px 10px", color:"#e6edf3", fontSize:12, outline:"none" }}
              />
            </div>
          </div>

          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:11, color:"#6e7681", marginBottom:6 }}>임시 비밀번호</div>
            <input value={newPw} onChange={e=>setNewPw(e.target.value)} placeholder="임시 비밀번호 (6자 이상)"
              style={{ width:"100%", boxSizing:"border-box", background:"#0d1117", border:"1px solid #30363d", borderRadius:6, padding:"8px 10px", color:"#e6edf3", fontSize:12, outline:"none" }}
            />
          </div>

          {error && <div style={{ background:"#2d0f0f", border:"1px solid #7f1d1d", borderRadius:6, padding:"8px 12px", fontSize:12, color:"#fca5a5", marginBottom:12 }}>{error}</div>}
          {success && <div style={{ background:"#052e16", border:"1px solid #16a34a", borderRadius:6, padding:"10px 12px", fontSize:12, color:"#86efac", marginBottom:12, lineHeight:1.6 }}>{success}</div>}

          <button onClick={createUser} disabled={creating}
            style={{ background:creating?"#21262d":"linear-gradient(135deg,#e85d04,#f48c06)", color:"#fff", border:"none", borderRadius:7, padding:"10px 20px", fontSize:13, fontWeight:700, cursor:creating?"not-allowed":"pointer" }}>
            {creating ? "생성 중..." : "계정 생성"}
          </button>
        </div>

        {/* 사용자 목록 */}
        <div style={{ background:"#161b22", border:"1px solid #21262d", borderRadius:10, padding:24 }}>
          <div style={{ fontWeight:700, fontSize:15, marginBottom:18 }}>허용된 사용자 ({users.length}명)</div>
          {loading ? (
            <div style={{ color:"#6e7681", fontSize:13 }}>로딩 중...</div>
          ) : (
            users.map(u => (
              <div key={u.email} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 12px", background:"#0d1117", borderRadius:7, marginBottom:6 }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:600, color:"#e6edf3" }}>{u.name}</div>
                  <div style={{ fontSize:11, color:"#6e7681", marginTop:2 }}>{u.email}</div>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  {ADMIN_EMAILS.includes(u.email) && <span style={{ fontSize:10, color:"#f48c06", background:"#2d1f00", padding:"2px 8px", borderRadius:10 }}>관리자</span>}
                  {!ADMIN_EMAILS.includes(u.email) && (
                    <button onClick={()=>deleteUser(u.email)}
                      style={{ background:"none", border:"1px solid #7f1d1d", color:"#fca5a5", borderRadius:6, padding:"4px 10px", fontSize:11, cursor:"pointer" }}>
                      삭제
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ── 상세 패널 ──
function DetailPanel({ lead, note, setNote, onClose, onStatus, onSave, saving, user }) {
  const src = SOURCES[lead.source] || { label: lead.source, color: "#555" };
  const rows = [
    { label: "지번주소", value: lead.address_jibun || lead.address_raw?.slice(0,60) || "-" },
    { label: "연락처",   value: lead.phone },
    { label: "가격",     value: lead.price || "-" },
    { label: "면적",     value: lead.area_m2 ? `${Number(lead.area_m2).toLocaleString()}㎡` : "-" },
    { label: "중개사",   value: lead.broker || "-" },
  ];
  return (
    <div style={{ width:284, flexShrink:0, background:"#161b22", borderLeft:"1px solid #21262d", display:"flex", flexDirection:"column", overflow:"hidden" }}>
      <div style={{ padding:"12px 14px", borderBottom:"1px solid #21262d", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, overflow:"hidden" }}>
          <span style={{ background:src.color, color:"#fff", fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:4, whiteSpace:"nowrap", flexShrink:0 }}>{src.label}</span>
          <span style={{ fontSize:12, fontWeight:700, color:"#e6edf3", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{lead.title}</span>
        </div>
        <button onClick={onClose} style={{ background:"none", border:"none", color:"#8b949e", cursor:"pointer", fontSize:16, flexShrink:0, marginLeft:6 }}>✕</button>
      </div>
      <div style={{ flex:1, overflowY:"auto", padding:14 }}>
        <div style={{ background:"#0d1117", borderRadius:8, overflow:"hidden", marginBottom:12 }}>
          {rows.map(({ label, value }, i) => (
            <div key={label} style={{ display:"grid", gridTemplateColumns:"60px 1fr", padding:"9px 12px", borderBottom:i<rows.length-1?"1px solid #21262d":"none", alignItems:"start" }}>
              <span style={{ fontSize:11, color:"#6e7681", paddingTop:1, whiteSpace:"nowrap" }}>{label}</span>
              <span style={{ fontSize:12, color:"#e6edf3", fontWeight:label==="연락처"?600:400, wordBreak:"break-all", lineHeight:1.5 }}>{value}</span>
            </div>
          ))}
        </div>
        {lead.description && (
          <div style={{ background:"#0d1117", borderRadius:8, padding:"10px 12px", marginBottom:12 }}>
            <div style={{ fontSize:10, color:"#6e7681", marginBottom:6, textTransform:"uppercase", letterSpacing:"0.7px" }}>광고 전문</div>
            <div style={{ fontSize:11, color:"#8b949e", lineHeight:1.7, wordBreak:"break-all" }}>{lead.description}</div>
          </div>
        )}
        <a href={`tel:${lead.phone}`} style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:8, background:"linear-gradient(135deg,#16a34a,#22c55e)", color:"#fff", padding:"10px 0", borderRadius:7, fontSize:13, fontWeight:700, textDecoration:"none", marginBottom:lead.url?6:12 }}>
          📞 {lead.phone}
        </a>
        {lead.url && (
          <a href={lead.url} target="_blank" rel="noreferrer" style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:6, background:"#21262d", border:"1px solid #30363d", color:"#8b949e", padding:"8px 0", borderRadius:7, fontSize:12, fontWeight:600, textDecoration:"none", marginBottom:12 }}>
            🔗 원문 보기
          </a>
        )}
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:10, color:"#6e7681", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.8px", marginBottom:7 }}>상태</div>
          {lead.assigned_to && (
            <div style={{ display:"flex", alignItems:"center", gap:6, background:"#1e1030", border:"1px solid #a78bfa", borderRadius:6, padding:"6px 10px", marginBottom:8 }}>
              <span style={{ fontSize:11, color:"#a78bfa" }}>🔒</span>
              <span style={{ fontSize:11, color:"#a78bfa", fontWeight:700 }}>{lead.assigned_to}님 확보</span>
            </div>
          )}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:5 }}>
            {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
              const isLocked = lead.assigned_to && lead.assigned_to !== user?.name && !user?.isAdmin;
              const disabled = isLocked;
              return (
                <button key={key} onClick={()=>!disabled&&onStatus(key)} style={{ padding:"6px 0", borderRadius:6, cursor:disabled?"not-allowed":"pointer", border:`1px solid ${lead.status===key?cfg.color:"#30363d"}`, background:lead.status===key?cfg.bg:"transparent", color:disabled?"#333":lead.status===key?cfg.color:"#6e7681", fontSize:11, fontWeight:lead.status===key?700:400, opacity:disabled?0.4:1 }}>
                  {cfg.label}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <div style={{ fontSize:10, color:"#6e7681", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.8px", marginBottom:7 }}>통화 메모</div>
          <textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="통화 내용, 소유자 반응, 특이사항..."
            style={{ width:"100%", boxSizing:"border-box", background:"#0d1117", border:"1px solid #30363d", borderRadius:6, padding:"9px 10px", color:"#e6edf3", fontSize:12, minHeight:90, resize:"vertical", outline:"none", fontFamily:"inherit", lineHeight:1.6 }}
          />
          <button onClick={onSave} disabled={saving} style={{ marginTop:6, width:"100%", background:"#21262d", border:"1px solid #30363d", color:saving?"#6e7681":"#c9d1d9", padding:"8px 0", borderRadius:6, fontSize:12, cursor:saving?"not-allowed":"pointer", fontWeight:600 }}>
            {saving?"저장 중...":"저장"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 메인 대시보드 ──
function Dashboard({ user, onLogout, onAdmin }) {
  const [leads, setLeads]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [filter, setFilter]       = useState("all");
  const [srcFilter, setSrcFilter] = useState("all");
  const [areaFilter, setAreaFilter] = useState("all");
  const [phoneFilter, setPhoneFilter] = useState("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [search, setSearch]       = useState("");
  const [selected, setSelected]   = useState(null);
  const [note, setNote]           = useState("");
  const [saving, setSaving]       = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [view, setView] = useState("list"); // "list" | "stats"

  const loadLeads = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await sbFetch("property_leads?select=*&order=collected_at.desc&limit=10000", {}, user.token);
      setLeads(Array.isArray(data) ? data : []);
      setLastRefresh(new Date());
    } catch(e) { setError(e.message); }
    finally { setLoading(false); }
  }, [user.token]);

  useEffect(() => { loadLeads(); }, [loadLeads]);

  const today = new Date().toISOString().slice(0,10);

  const AREAS = [
    ["제주시", "제주시"],
    ["서귀포시", "서귀포시"],
    ["노형동|연동", "노형동·연동"],
  ];

  const filtered = leads.filter(l => {
    if (filter !== "all" && l.status !== filter) return false;
    if (filter === "acquired" && assigneeFilter !== "all" && l.assigned_to !== assigneeFilter) return false;
    if (srcFilter !== "all" && l.source !== srcFilter) return false;
    if (areaFilter !== "all") {
      const addr = (l.address_jibun || l.address_raw || "");
      const keywords = areaFilter.split("|");
      if (!keywords.some(k => addr.includes(k))) return false;
    }
    if (phoneFilter === "has" && !l.phone) return false;
    if (search) {
      const q = search.toLowerCase();
      const hay = [l.address_jibun,l.address_raw,l.phone,l.title,l.description,l.broker,l.note].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const counts = Object.fromEntries(Object.keys(STATUS_CONFIG).map(s=>[s,leads.filter(l=>l.status===s).length]));
  const todayCount = leads.filter(l=>l.collected_at?.startsWith(today)).length;
  const acquiredAssignees = Array.from(new Set(leads.filter(l=>l.status==="acquired" && l.assigned_to).map(l=>l.assigned_to)));

  async function updateStatus(newStatus) {
    // 다른 사람이 물건확보한 경우 차단 (관리자 제외)
    if (selected.assigned_to && selected.assigned_to !== user.name && !user.isAdmin) {
      alert(selected.assigned_to + "님이 이미 확보한 매물입니다.");
      return;
    }
    // 물건확보 취소 시 본인 확인
    if (selected.status === "acquired" && newStatus !== "acquired") {
      if (selected.assigned_to !== user.name && !user.isAdmin) {
        alert("본인이 확보한 매물만 변경할 수 있습니다.");
        return;
      }
    }
    try {
      const patch = { status: newStatus };
      if (newStatus === "acquired") patch.assigned_to = user.name;
      if (selected.status === "acquired" && newStatus !== "acquired") patch.assigned_to = null;
      await sbFetch(`property_leads?id=eq.${selected.id}`, { method:"PATCH", body:JSON.stringify(patch) }, user.token);
      setLeads(p=>p.map(l=>l.id===selected.id?{...l,...patch}:l));
      setSelected(p=>({...p,...patch}));
    } catch(e) { alert("오류: "+e.message); }
  }

  async function saveNote() {
    setSaving(true);
    try {
      await sbFetch(`property_leads?id=eq.${selected.id}`, { method:"PATCH", body:JSON.stringify({note, contacted_at:new Date().toISOString()}) }, user.token);
      setLeads(p=>p.map(l=>l.id===selected.id?{...l,note}:l));
      setSelected(p=>({...p,note}));
    } catch(e) { alert("오류: "+e.message); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ fontFamily:"'Noto Sans KR',sans-serif", background:"#0d1117", minHeight:"100vh", color:"#e6edf3" }}>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&display=swap" rel="stylesheet"/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes fadeIn{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}} *::-webkit-scrollbar{width:4px} *::-webkit-scrollbar-track{background:#0d1117} *::-webkit-scrollbar-thumb{background:#30363d;border-radius:2px}`}</style>

      <div style={{ background:"#161b22", borderBottom:"1px solid #21262d", padding:"0 20px", display:"flex", alignItems:"center", justifyContent:"space-between", height:52 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:26, height:26, background:"linear-gradient(135deg,#e85d04,#f48c06)", borderRadius:6, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:700 }}>V</div>
          <span style={{ fontWeight:700, fontSize:14 }}>Verita 매물 수집</span>
          <span style={{ fontSize:10, color:"#22c55e", background:"#052e16", padding:"2px 8px", borderRadius:10, border:"1px solid #16a34a" }}>● Live</span>
          <div style={{ display:"flex", gap:4, marginLeft:8 }}>
            <button onClick={()=>setView("list")} style={{ background:view==="list"?"#21262d":"transparent", border:"1px solid #30363d", color:view==="list"?"#e6edf3":"#8b949e", borderRadius:6, padding:"5px 12px", fontSize:12, cursor:"pointer", fontWeight:view==="list"?700:400 }}>📋 매물목록</button>
            <button onClick={()=>setView("stats")} style={{ background:view==="stats"?"#21262d":"transparent", border:"1px solid #30363d", color:view==="stats"?"#e6edf3":"#8b949e", borderRadius:6, padding:"5px 12px", fontSize:12, cursor:"pointer", fontWeight:view==="stats"?700:400 }}>📊 통계</button>
            <button onClick={()=>setView("briefing")} style={{ background:view==="briefing"?"#21262d":"transparent", border:"1px solid #30363d", color:view==="briefing"?"#e6edf3":"#8b949e", borderRadius:6, padding:"5px 12px", fontSize:12, cursor:"pointer", fontWeight:view==="briefing"?700:400 }}>📅 브리핑</button>
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          {lastRefresh && <span style={{ fontSize:11, color:"#6e7681" }}>갱신 {lastRefresh.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})}</span>}
          <span style={{ fontSize:12, color:"#8b949e" }}>👤 {user.name}</span>
          {user.isAdmin && (
            <button onClick={onAdmin} style={{ background:"#21262d", border:"1px solid #30363d", color:"#f48c06", borderRadius:6, padding:"6px 12px", fontSize:12, cursor:"pointer", fontWeight:600 }}>
              ⚙️ 관리자
            </button>
          )}
          <button onClick={loadLeads} disabled={loading} style={{ background:loading?"#21262d":"linear-gradient(135deg,#e85d04,#f48c06)", color:"#fff", border:"none", borderRadius:6, padding:"6px 13px", fontSize:12, fontWeight:600, cursor:loading?"not-allowed":"pointer", display:"flex", alignItems:"center", gap:5 }}>
            <span style={{ display:"inline-block", animation:loading?"spin 1s linear infinite":"none" }}>⟳</span>
            {loading?"불러오는 중...":"목록 새로고침"}
          </button>
          <button onClick={onLogout} style={{ background:"none", border:"1px solid #30363d", color:"#8b949e", borderRadius:6, padding:"6px 12px", fontSize:12, cursor:"pointer" }}>로그아웃</button>
        </div>
      </div>

      {error && <div style={{ background:"#2d0f0f", borderBottom:"1px solid #7f1d1d", padding:"8px 20px", fontSize:12, color:"#fca5a5" }}>⚠️ {error}</div>}

      {view === "stats" ? (
        <StatsPanel leads={leads} today={today} />
      ) : view === "briefing" ? (
        <BriefingPanel user={user} leads={leads} />
      ) : (
      <div style={{ display:"flex", height:"calc(100vh - 52px)" }}>
        <div style={{ width:148, background:"#161b22", borderRight:"1px solid #21262d", padding:"14px 0", flexShrink:0, overflowY:"auto" }}>
          <div style={{ padding:"0 12px 8px", fontSize:10, color:"#6e7681", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.8px" }}>상태</div>
          {[["all","전체",leads.length],...Object.entries(STATUS_CONFIG).map(([k,v])=>[k,v.label,counts[k]])].map(([key,label,count])=>(
            <div key={key}>
              <button onClick={()=>{ setFilter(key); if(key!=="acquired") setAssigneeFilter("all"); }} style={{ width:"100%", textAlign:"left", padding:"7px 12px", background:filter===key?"#21262d":"transparent", border:"none", color:filter===key?"#e6edf3":"#8b949e", fontSize:12, cursor:"pointer", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <span>{label}</span>
                <span style={{ fontSize:10, background:filter===key?"#30363d":"transparent", padding:"1px 6px", borderRadius:8, color:filter===key?"#e6edf3":"#6e7681" }}>{count}</span>
              </button>
              {key==="acquired" && filter==="acquired" && acquiredAssignees.length>0 && (
                <div style={{ paddingLeft:10 }}>
                  {[["all","전체",counts.acquired],...acquiredAssignees.map(name=>[name,name,leads.filter(l=>l.status==="acquired"&&l.assigned_to===name).length])].map(([akey,alabel,acount])=>(
                    <button key={akey} onClick={()=>setAssigneeFilter(akey)} style={{ width:"100%", textAlign:"left", padding:"5px 12px", background:assigneeFilter===akey?"#262c36":"transparent", border:"none", borderLeft:assigneeFilter===akey?"2px solid #a78bfa":"2px solid transparent", color:assigneeFilter===akey?"#e6edf3":"#6e7681", fontSize:11, cursor:"pointer", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <span>{akey==="all"?"전체":"🔒 "+alabel}</span>
                      <span style={{ fontSize:9, color:"#6e7681" }}>{acount}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
          <div style={{ margin:"12px 12px 8px", height:1, background:"#21262d" }}/>
          <div style={{ padding:"0 12px 8px", fontSize:10, color:"#6e7681", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.8px" }}>소스</div>
          {[["all","전체"],...Object.entries(SOURCES).map(([k,v])=>[k,v.label])].map(([key,label])=>(
            <button key={key} onClick={()=>setSrcFilter(key)} style={{ width:"100%", textAlign:"left", padding:"6px 12px", background:srcFilter===key?"#21262d":"transparent", border:"none", color:srcFilter===key?"#e6edf3":"#8b949e", fontSize:12, cursor:"pointer", display:"flex", alignItems:"center", gap:7 }}>
              {key!=="all"&&<span style={{ width:7, height:7, borderRadius:"50%", background:SOURCES[key]?.color, flexShrink:0 }}/>}
              {label}
            </button>
          ))}
          <div style={{ margin:"12px 12px 10px", height:1, background:"#21262d" }}/>
          <div style={{ padding:"0 12px" }}>
            <div style={{ fontSize:10, color:"#6e7681", marginBottom:4 }}>오늘 수집</div>
            <div style={{ fontSize:26, fontWeight:700, color:"#f48c06", lineHeight:1 }}>{todayCount}</div>
            <div style={{ fontSize:10, color:"#6e7681", marginTop:2 }}>총 {leads.length}건</div>
          </div>
          <div style={{ margin:"12px 12px 8px", height:1, background:"#21262d" }}/>
          <div style={{ padding:"0 12px 8px", fontSize:10, color:"#6e7681", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.8px" }}>연락처</div>
          {[["all","전체",leads.length],["has","연락처 있음",leads.filter(l=>!!l.phone).length]].map(([key,label,count])=>(
            <button key={key} onClick={()=>setPhoneFilter(key)} style={{ width:"100%", textAlign:"left", padding:"6px 12px", background:phoneFilter===key?"#21262d":"transparent", border:"none", color:phoneFilter===key?"#e6edf3":"#8b949e", fontSize:12, cursor:"pointer", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span>{label}</span>
              <span style={{ fontSize:10, background:phoneFilter===key?"#30363d":"transparent", padding:"1px 6px", borderRadius:8, color:phoneFilter===key?"#e6edf3":"#6e7681" }}>{count}</span>
            </button>
          ))}
          <div style={{ margin:"12px 12px 8px", height:1, background:"#21262d" }}/>
          <div style={{ padding:"0 12px 8px", fontSize:10, color:"#6e7681", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.8px" }}>지역</div>
          {[["all","전체"],...AREAS].map(([key,label])=>(
            <button key={key} onClick={()=>setAreaFilter(key)}
              style={{ width:"100%", textAlign:"left", padding:"6px 12px", background:areaFilter===key?"#21262d":"transparent", border:"none", color:areaFilter===key?"#e6edf3":"#8b949e", fontSize:12, cursor:"pointer" }}>
              {label}
            </button>
          ))}
        </div>

        <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
          <div style={{ padding:"10px 12px", borderBottom:"1px solid #21262d", background:"#161b22" }}>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="주소 · 연락처 · 제목 검색..."
              style={{ width:"100%", background:"#0d1117", border:"1px solid #30363d", borderRadius:6, padding:"7px 11px", color:"#e6edf3", fontSize:12, outline:"none", boxSizing:"border-box" }}
            />
          </div>
          <div style={{ flex:1, overflowY:"auto", padding:"6px" }}>
            {loading && <div style={{ textAlign:"center", padding:"60px 0", color:"#6e7681" }}><div style={{ fontSize:24, animation:"spin 1s linear infinite", display:"inline-block" }}>⟳</div><div style={{ marginTop:8, fontSize:13 }}>불러오는 중...</div></div>}
            {!loading && filtered.length===0 && <div style={{ textAlign:"center", padding:"60px 0", color:"#6e7681", fontSize:13 }}>데이터 없음</div>}
            {!loading && filtered.map((lead,i)=>{
              const src=SOURCES[lead.source]||{label:lead.source,color:"#555"};
              const st=STATUS_CONFIG[lead.status]||STATUS_CONFIG.new;
              const active=selected?.id===lead.id;
              const isNew = lead.collected_at?.startsWith(today);
              return (
                <div key={lead.id} onClick={()=>{setSelected(lead);setNote(lead.note||"");}}
                  style={{ background:active?"#1c2128":"#161b22", border:`1px solid ${isNew&&!active?"#f48c0644":active?"#388bfd44":"#21262d"}`, borderRadius:7, padding:"10px 12px", marginBottom:4, cursor:"pointer", transition:"background 0.12s", animation:`fadeIn 0.18s ease ${Math.min(i,20)*0.02}s both` }}>
                  <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:6 }}>
                    <span style={{ background:src.color, color:"#fff", fontSize:9, fontWeight:700, padding:"2px 6px", borderRadius:3, whiteSpace:"nowrap", flexShrink:0 }}>{src.label}</span>
                    {isNew && <span style={{ background:"#f48c06", color:"#fff", fontSize:9, fontWeight:800, padding:"2px 6px", borderRadius:3, whiteSpace:"nowrap", flexShrink:0, letterSpacing:"0.5px" }}>NEW</span>}
                    <span style={{ fontSize:12, fontWeight:600, color:"#e6edf3", flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{lead.title}</span>
                    <span style={{ background:st.bg, color:st.color, fontSize:10, fontWeight:600, padding:"2px 7px", borderRadius:10, whiteSpace:"nowrap", flexShrink:0 }}>{st.label}</span>
                    <span style={{ fontSize:10, color:"#6e7681", whiteSpace:"nowrap", flexShrink:0 }}>{timeAgo(lead.collected_at)}</span>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr auto auto", gap:"0 14px", fontSize:11, color:"#8b949e" }}>
                    <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>📍 {lead.address_jibun||lead.address_raw?.slice(0,30)||"-"}</span>
                    <span style={{ whiteSpace:"nowrap" }}>📞 {lead.phone}</span>
                    <span style={{ whiteSpace:"nowrap" }}>💰 {lead.price||"-"}</span>
                  </div>
                  {lead.note&&<div style={{ marginTop:6, fontSize:10, color:"#f48c06", background:"#1a1206", padding:"3px 8px", borderRadius:3, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>💬 {lead.note}</div>}
                  {lead.assigned_to&&<div style={{ marginTop:4, fontSize:10, color:"#a78bfa", background:"#1e1030", padding:"3px 8px", borderRadius:3, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>🔒 {lead.assigned_to}님 확보</div>}
                </div>
              );
            })}
          </div>
        </div>
        {selected&&<DetailPanel lead={selected} note={note} setNote={setNote} onClose={()=>setSelected(null)} onStatus={updateStatus} onSave={saveNote} saving={saving} user={user}/>}
      </div>
      )}
    </div>
  );
}

// ── 앱 루트 ──
export default function App() {
  const [user, setUser] = useState(() => { try { return JSON.parse(localStorage.getItem("verita_user")); } catch { return null; } });
  const [page, setPage] = useState("dashboard");

  // 토큰 만료 감지 (1시간마다 체크)
  useEffect(() => {
    if (!user) return;
    async function refreshToken() {
      try {
        const saved = JSON.parse(localStorage.getItem("verita_user"));
        if (!saved?.refresh_token) return;
        const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
          method: "POST",
          headers: { "apikey": SUPABASE_ANON, "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: saved.refresh_token }),
        });
        if (!res.ok) { handleLogout(); return; }
        const data = await res.json();
        const updated = { ...saved, token: data.access_token, refresh_token: data.refresh_token };
        localStorage.setItem("verita_user", JSON.stringify(updated));
        setUser(updated);
      } catch {
        handleLogout();
      }
    }
    refreshToken();
    const interval = setInterval(refreshToken, 50 * 60 * 1000); // 50분마다
    return () => clearInterval(interval);
  }, []);

  function handleLogin(userData) {
    localStorage.setItem("verita_user", JSON.stringify(userData));
    setUser(userData);
  }

  function handleLogout() {
    localStorage.removeItem("verita_user");
    setUser(null); setPage("dashboard");
  }

  if (!user) return <LoginPage onLogin={handleLogin} />;
  if (page === "admin" && user.isAdmin) return <AdminPage user={user} onBack={()=>setPage("dashboard")} />;
  return <Dashboard user={user} onLogout={handleLogout} onAdmin={()=>setPage("admin")} />;
}

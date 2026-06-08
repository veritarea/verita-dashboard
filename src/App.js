import { useState, useEffect, useCallback } from "react";

const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL;
const SUPABASE_ANON = process.env.REACT_APP_SUPABASE_ANON;

const SOURCES = {
  gyocharo:    { label: "교차로",    color: "#e85d04" },
  oiljang:     { label: "오일장",    color: "#0077b6" },
  oiljang_line:{ label: "줄광고",    color: "#023e8a" },
  daangn:      { label: "당근",      color: "#ff6900" },
  naver_cafe:  { label: "네이버카페", color: "#03c75a" },
};

const STATUS_CONFIG = {
  new:       { label: "신규",    color: "#22c55e", bg: "#052e16" },
  called:    { label: "연락완료", color: "#3b82f6", bg: "#0c1a2e" },
  callback:  { label: "콜백예정", color: "#f59e0b", bg: "#2d1f00" },
  acquired:  { label: "물건확보", color: "#a78bfa", bg: "#1e1030" },
  rejected:  { label: "거절",    color: "#6b7280", bg: "#1a1a1a" },
  duplicate: { label: "중복",    color: "#9ca3af", bg: "#111" },
};

async function sbFetch(path, opts = {}, token = null) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const headers = {
    "apikey": SUPABASE_ANON,
    "Authorization": `Bearer ${token || SUPABASE_ANON}`,
    "Content-Type": "application/json",
    "Prefer": opts.method === "PATCH" ? "return=minimal" : "return=representation",
  };
  const res = await fetch(url, { method: opts.method || "GET", headers, body: opts.body });
  if (!res.ok) throw new Error(await res.text());
  const t = await res.text();
  return t ? JSON.parse(t) : [];
}

async function sbAuth(action, email, password) {
  const url = `${SUPABASE_URL}/auth/v1/${action}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "apikey": SUPABASE_ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.msg || "인증 오류");
  return data;
}

function timeAgo(d) {
  const s = (Date.now() - new Date(d)) / 1000;
  if (s < 60)    return "방금";
  if (s < 3600)  return `${Math.floor(s/60)}분 전`;
  if (s < 86400) return `${Math.floor(s/3600)}시간 전`;
  return `${Math.floor(s/86400)}일 전`;
}

// ── 로그인 화면 ──
function LoginPage({ onLogin }) {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [mode, setMode]         = useState("login"); // login | signup

  async function handleSubmit() {
    if (!email || !password) return;
    setLoading(true); setError("");
    try {
      if (mode === "signup") {
        // 허용된 이메일인지 먼저 확인
        const allowed = await sbFetch(`allowed_users?email=eq.${encodeURIComponent(email)}&select=email`);
        if (!allowed || allowed.length === 0) {
          throw new Error("승인되지 않은 이메일입니다. 관리자에게 문의하세요.");
        }
        await sbAuth("signup", email, password);
        setError(""); 
        alert("회원가입 완료! 이메일 인증 후 로그인하세요.");
        setMode("login");
      } else {
        const data = await sbAuth("token?grant_type=password", email, password);
        // 허용된 이메일인지 확인
        const allowed = await sbFetch(`allowed_users?email=eq.${encodeURIComponent(email)}&select=email`);
        if (!allowed || allowed.length === 0) {
          throw new Error("접근 권한이 없습니다.");
        }
        onLogin({ token: data.access_token, email, name: email.split("@")[0] });
      }
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
        {/* 로고 */}
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:28 }}>
          <div style={{ width:36, height:36, background:"linear-gradient(135deg,#e85d04,#f48c06)", borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, fontWeight:700, color:"#fff" }}>V</div>
          <div>
            <div style={{ fontWeight:700, fontSize:16, color:"#e6edf3" }}>Verita</div>
            <div style={{ fontSize:11, color:"#6e7681" }}>매물 수집 시스템</div>
          </div>
        </div>

        {/* 탭 */}
        <div style={{ display:"flex", marginBottom:24, background:"#0d1117", borderRadius:8, padding:3 }}>
          {[["login","로그인"],["signup","회원가입"]].map(([key,label])=>(
            <button key={key} onClick={()=>{ setMode(key); setError(""); }}
              style={{ flex:1, padding:"7px 0", borderRadius:6, border:"none", background:mode===key?"#21262d":"transparent", color:mode===key?"#e6edf3":"#6e7681", fontSize:13, fontWeight:mode===key?600:400, cursor:"pointer" }}>
              {label}
            </button>
          ))}
        </div>

        {/* 폼 */}
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:12, color:"#8b949e", marginBottom:6 }}>이메일</div>
          <input value={email} onChange={e=>setEmail(e.target.value)}
            placeholder="이메일 입력"
            style={{ width:"100%", boxSizing:"border-box", background:"#0d1117", border:"1px solid #30363d", borderRadius:6, padding:"9px 12px", color:"#e6edf3", fontSize:13, outline:"none" }}
          />
        </div>
        <div style={{ marginBottom:20 }}>
          <div style={{ fontSize:12, color:"#8b949e", marginBottom:6 }}>비밀번호</div>
          <input value={password} onChange={e=>setPassword(e.target.value)}
            type="password" placeholder="비밀번호 입력"
            onKeyDown={e=>e.key==="Enter"&&handleSubmit()}
            style={{ width:"100%", boxSizing:"border-box", background:"#0d1117", border:"1px solid #30363d", borderRadius:6, padding:"9px 12px", color:"#e6edf3", fontSize:13, outline:"none" }}
          />
        </div>

        {error && (
          <div style={{ background:"#2d0f0f", border:"1px solid #7f1d1d", borderRadius:6, padding:"8px 12px", fontSize:12, color:"#fca5a5", marginBottom:14 }}>
            {error}
          </div>
        )}

        <button onClick={handleSubmit} disabled={loading}
          style={{ width:"100%", background:loading?"#21262d":"linear-gradient(135deg,#e85d04,#f48c06)", color:"#fff", border:"none", borderRadius:7, padding:"11px 0", fontSize:14, fontWeight:700, cursor:loading?"not-allowed":"pointer" }}>
          {loading ? "처리 중..." : mode==="login" ? "로그인" : "회원가입"}
        </button>

        {mode==="signup" && (
          <div style={{ marginTop:14, fontSize:11, color:"#6e7681", textAlign:"center", lineHeight:1.6 }}>
            관리자가 허용한 이메일만 가입 가능합니다
          </div>
        )}
      </div>
    </div>
  );
}

// ── 상세 패널 ──
function DetailPanel({ lead, note, setNote, onClose, onStatus, onSave, saving }) {
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
        <a href={`tel:${lead.phone}`} style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:8, background:"linear-gradient(135deg,#16a34a,#22c55e)", color:"#fff", padding:"10px 0", borderRadius:7, fontSize:13, fontWeight:700, textDecoration:"none", marginBottom:12 }}>
          📞 {lead.phone}
        </a>
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:10, color:"#6e7681", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.8px", marginBottom:7 }}>상태</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:5 }}>
            {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
              <button key={key} onClick={()=>onStatus(key)} style={{ padding:"6px 0", borderRadius:6, cursor:"pointer", border:`1px solid ${lead.status===key?cfg.color:"#30363d"}`, background:lead.status===key?cfg.bg:"transparent", color:lead.status===key?cfg.color:"#6e7681", fontSize:11, fontWeight:lead.status===key?700:400 }}>
                {cfg.label}
              </button>
            ))}
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
function Dashboard({ user, onLogout }) {
  const [leads, setLeads]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [filter, setFilter]       = useState("all");
  const [srcFilter, setSrcFilter] = useState("all");
  const [search, setSearch]       = useState("");
  const [selected, setSelected]   = useState(null);
  const [note, setNote]           = useState("");
  const [saving, setSaving]       = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);

  const loadLeads = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await sbFetch("property_leads?select=*&order=collected_at.desc&limit=300", {}, user.token);
      setLeads(Array.isArray(data) ? data : []);
      setLastRefresh(new Date());
    } catch(e) { setError(e.message); }
    finally { setLoading(false); }
  }, [user.token]);

  useEffect(() => { loadLeads(); }, [loadLeads]);

  const today = new Date().toISOString().slice(0,10);
  const filtered = leads.filter(l => {
    if (filter !== "all" && l.status !== filter) return false;
    if (srcFilter !== "all" && l.source !== srcFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const hay = [l.address_jibun,l.address_raw,l.phone,l.title,l.description,l.broker].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const counts = Object.fromEntries(Object.keys(STATUS_CONFIG).map(s=>[s,leads.filter(l=>l.status===s).length]));
  const todayCount = leads.filter(l=>l.collected_at?.startsWith(today)).length;

  async function updateStatus(newStatus) {
    try {
      await sbFetch(`property_leads?id=eq.${selected.id}`, { method:"PATCH", body:JSON.stringify({status:newStatus}) }, user.token);
      setLeads(p=>p.map(l=>l.id===selected.id?{...l,status:newStatus}:l));
      setSelected(p=>({...p,status:newStatus}));
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

      {/* 헤더 */}
      <div style={{ background:"#161b22", borderBottom:"1px solid #21262d", padding:"0 20px", display:"flex", alignItems:"center", justifyContent:"space-between", height:52 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:26, height:26, background:"linear-gradient(135deg,#e85d04,#f48c06)", borderRadius:6, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:700 }}>V</div>
          <span style={{ fontWeight:700, fontSize:14 }}>Verita 매물 수집</span>
          <span style={{ fontSize:10, color:"#22c55e", background:"#052e16", padding:"2px 8px", borderRadius:10, border:"1px solid #16a34a" }}>● Live</span>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:14 }}>
          {lastRefresh && <span style={{ fontSize:11, color:"#6e7681" }}>갱신 {lastRefresh.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})}</span>}
          <span style={{ fontSize:12, color:"#8b949e" }}>👤 {user.name}</span>
          <button onClick={loadLeads} disabled={loading} style={{ background:loading?"#21262d":"linear-gradient(135deg,#e85d04,#f48c06)", color:"#fff", border:"none", borderRadius:6, padding:"6px 13px", fontSize:12, fontWeight:600, cursor:loading?"not-allowed":"pointer", display:"flex", alignItems:"center", gap:5 }}>
            <span style={{ display:"inline-block", animation:loading?"spin 1s linear infinite":"none" }}>⟳</span>
            {loading?"로딩 중...":"새로고침"}
          </button>
          <button onClick={onLogout} style={{ background:"none", border:"1px solid #30363d", color:"#8b949e", borderRadius:6, padding:"6px 12px", fontSize:12, cursor:"pointer" }}>로그아웃</button>
        </div>
      </div>

      {error && <div style={{ background:"#2d0f0f", borderBottom:"1px solid #7f1d1d", padding:"8px 20px", fontSize:12, color:"#fca5a5" }}>⚠️ {error}</div>}

      <div style={{ display:"flex", height:"calc(100vh - 52px)" }}>
        {/* 사이드바 */}
        <div style={{ width:148, background:"#161b22", borderRight:"1px solid #21262d", padding:"14px 0", flexShrink:0, overflowY:"auto" }}>
          <div style={{ padding:"0 12px 8px", fontSize:10, color:"#6e7681", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.8px" }}>상태</div>
          {[["all","전체",leads.length],...Object.entries(STATUS_CONFIG).map(([k,v])=>[k,v.label,counts[k]])].map(([key,label,count])=>(
            <button key={key} onClick={()=>setFilter(key)} style={{ width:"100%", textAlign:"left", padding:"7px 12px", background:filter===key?"#21262d":"transparent", border:"none", color:filter===key?"#e6edf3":"#8b949e", fontSize:12, cursor:"pointer", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span>{label}</span>
              <span style={{ fontSize:10, background:filter===key?"#30363d":"transparent", padding:"1px 6px", borderRadius:8, color:filter===key?"#e6edf3":"#6e7681" }}>{count}</span>
            </button>
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
        </div>

        {/* 리스트 */}
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
              return (
                <div key={lead.id} onClick={()=>{setSelected(lead);setNote(lead.note||"");}}
                  style={{ background:active?"#1c2128":"#161b22", border:`1px solid ${active?"#388bfd44":"#21262d"}`, borderRadius:7, padding:"10px 12px", marginBottom:4, cursor:"pointer", transition:"background 0.12s", animation:`fadeIn 0.18s ease ${Math.min(i,20)*0.02}s both` }}>
                  <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:6 }}>
                    <span style={{ background:src.color, color:"#fff", fontSize:9, fontWeight:700, padding:"2px 6px", borderRadius:3, whiteSpace:"nowrap", flexShrink:0 }}>{src.label}</span>
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
                </div>
              );
            })}
          </div>
        </div>

        {selected&&<DetailPanel lead={selected} note={note} setNote={setNote} onClose={()=>setSelected(null)} onStatus={updateStatus} onSave={saveNote} saving={saving}/>}
      </div>
    </div>
  );
}

// ── 앱 루트 ──
export default function App() {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem("verita_user");
    return saved ? JSON.parse(saved) : null;
  });

  function handleLogin(userData) {
    localStorage.setItem("verita_user", JSON.stringify(userData));
    setUser(userData);
  }

  function handleLogout() {
    localStorage.removeItem("verita_user");
    setUser(null);
  }

  if (!user) return <LoginPage onLogin={handleLogin} />;
  return <Dashboard user={user} onLogout={handleLogout} />;
}

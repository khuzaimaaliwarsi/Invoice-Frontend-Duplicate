import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import StatusBadge from '../components/common/StatusBadge';
import { money } from '../utils/formatters';

// Smooth SVG Area Sparkline with gradient under-fill (VIP Reference Style)
function AreaSparkline({ id, color = '#10b981', points = [25, 30, 20, 45, 35, 60, 50, 75], width = 110, height = 48 }) {
  const max = Math.max(...points, 100);
  const min = Math.min(...points, 0);
  const range = max - min || 1;

  // Calculate coordinates
  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * (width - 8) + 4;
    const y = height - 6 - ((p - min) / range) * (height - 14);
    return { x, y };
  });

  // Construct smooth cubic Bezier path
  let pathD = `M ${coords[0].x} ${coords[0].y}`;
  for (let i = 0; i < coords.length - 1; i++) {
    const current = coords[i];
    const next = coords[i + 1];
    const controlX = (current.x + next.x) / 2;
    pathD += ` C ${controlX} ${current.y}, ${controlX} ${next.y}, ${next.x} ${next.y}`;
  }

  const areaD = `${pathD} L ${coords[coords.length - 1].x} ${height} L ${coords[0].x} ${height} Z`;
  const lastCoord = coords[coords.length - 1];

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible', flexShrink: 0 }}>
      <defs>
        <linearGradient id={`grad-${id}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0.0" />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#grad-${id})`} />
      <path d={pathD} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastCoord.x} cy={lastCoord.y} r="3.5" fill={color} stroke="#ffffff" strokeWidth="1.5" />
    </svg>
  );
}

export default function DashboardPage() {
  const { state, setCurrentPage, getBusinessName, getCustomerName, formatMoney } = useApp();
  const [statusFilter, setStatusFilter] = useState('all');
  const [timeRange, setTimeRange] = useState('30d');
  const [businessFilter, setBusinessFilter] = useState('all');

  const businessCount = state.businesses.length;
  const customerCount = state.customers.length;
  const invoiceCount = state.invoices.length;

  const totalInvoiced = state.invoices.reduce((acc, i) => acc + Number(i.total || 0), 0);
  const totalCollected = state.invoices.reduce((acc, i) => acc + Number(i.paid || 0), 0);
  const totalOutstanding = state.invoices.reduce(
    (acc, i) => acc + Math.max(0, Number(i.subtotal || 0) - Number(i.paid || 0)),
    0
  );
  const defaultCurrency = state.settings?.currency || 'PKR';

  const paidCount = state.invoices.filter((i) => i.status === 'Paid').length;
  const unpaidCount = state.invoices.filter((i) => i.status === 'Unpaid').length;
  const partialCount = state.invoices.filter((i) => i.status === 'Partial').length;

  const collectionRate = totalInvoiced > 0 ? Math.round((totalCollected / totalInvoiced) * 100) : 0;

  // Filter recent invoices
  const filteredRecent = state.invoices
    .filter((inv) => {
      if (statusFilter !== 'all' && inv.status !== statusFilter) return false;
      if (businessFilter !== 'all' && String(inv.businessId) !== String(businessFilter)) return false;
      return true;
    })
    .slice(0, 10);

  // Per business performance breakdown
  const businessStats = state.businesses.map((b) => {
    const bInvoices = state.invoices.filter((i) => String(i.businessId) === String(b.id));
    const bCustomers = state.customers.filter((c) => String(c.businessId) === String(b.id));
    const bInvoiced = bInvoices.reduce((acc, i) => acc + Number(i.total || 0), 0);
    const bCollected = bInvoices.reduce((acc, i) => acc + Number(i.paid || 0), 0);
    const bOutstanding = bInvoices.reduce(
      (acc, i) => acc + Math.max(0, Number(i.subtotal || 0) - Number(i.paid || 0)),
      0
    );
    const bRate = bInvoiced > 0 ? Math.round((bCollected / bInvoiced) * 100) : 0;
    return {
      ...b,
      clientCount: bCustomers.length,
      invoiceCount: bInvoices.length,
      totalInvoiced: bInvoiced,
      totalCollected: bCollected,
      totalOutstanding: bOutstanding,
      collectionRate: bRate
    };
  });

  return (
    <section id="dashboard" className="page active" style={{ maxWidth: '100%' }}>
      {/* 1. VIP Top Header & Controls Bar (Matching Reference Screenshot) */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px',
        marginBottom: '22px'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#18181b', letterSpacing: '-0.3px' }}>
              Financial Intelligence
            </h2>
            <span style={{
              background: '#f0f9ff',
              color: '#0284c7',
              fontSize: '11px',
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: '9999px',
              border: '1px solid #bae6fd'
            }}>
              Real-time
            </span>
          </div>
          <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#71717a' }}>
            Live view of multi-business billing, collections velocity, and ledger clearance
          </p>
        </div>

        {/* Right side controls matching reference: [7d][30d][3m][6m][1y][Custom] + [All sources ▾] + [Export] + [+ Create Invoice] */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Segmented Period Pill: [7d] [30d] [3m] [6m] [1y] [Custom] */}
          <div style={{
            display: 'inline-flex',
            background: '#ffffff',
            padding: '3px',
            borderRadius: '9px',
            border: '1px solid #e4e4e7',
            boxShadow: 'none'
          }}>
            {['7d', '30d', '3m', '6m', '1y', 'Custom'].map((range) => (
              <button
                key={range}
                type="button"
                onClick={() => setTimeRange(range)}
                style={{
                  padding: '4px 10px',
                  borderRadius: '6px',
                  fontSize: '11.5px',
                  fontWeight: timeRange === range ? 700 : 500,
                  background: timeRange === range ? '#0284c7' : 'transparent',
                  color: timeRange === range ? '#ffffff' : '#71717a',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                {range}
              </button>
            ))}
          </div>

          {/* Business Filter Dropdown Pill */}
          <select
            value={businessFilter}
            onChange={(e) => setBusinessFilter(e.target.value)}
            style={{
              padding: '6px 12px',
              borderRadius: '9px',
              border: '1px solid #e4e4e7',
              background: '#ffffff',
              fontSize: '12px',
              fontWeight: 600,
              color: '#3f3f46',
              cursor: 'pointer',
              outline: 'none',
              boxShadow: 'none'
            }}
          >
            <option value="all">All sources ▾</option>
            {state.businesses.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>

          {/* Export Action Button (Matching Reference) */}
          <button
            type="button"
            className="btn light"
            onClick={() => setCurrentPage('reports')}
            style={{
              borderRadius: '9px',
              padding: '6px 13px',
              fontSize: '12px',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: '#ffffff',
              border: '1px solid #e4e4e7',
              color: '#3f3f46',
              boxShadow: 'none'
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>Export</span>
          </button>

          {/* Create Invoice Primary Button */}
          <button
            type="button"
            className="btn primary"
            onClick={() => setCurrentPage('generator')}
            style={{
              borderRadius: '9px',
              padding: '6px 16px',
              fontSize: '12px',
              fontWeight: 650,
              background: '#0284c7',
              color: '#ffffff',
              border: '1px solid #0284c7',
              boxShadow: 'none'
            }}
          >
            <span>+ Create Invoice</span>
          </button>
        </div>
      </div>

      {/* 2. Top VIP KPI Cards (Sky Blue, Red, Sky Blue Curves) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: '16px',
        marginBottom: '22px'
      }}>
        {/* Card 1: Total Invoiced (Sky Blue Sparkline + Trend) */}
        <div style={{
          background: '#ffffff',
          border: '1px solid #eef2f6',
          borderRadius: '16px',
          padding: '20px 22px',
          boxShadow: 'none',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          cursor: 'default',
          transition: 'transform 0.15s ease'
        }}>
          {/* Top Row: Icon + Trend Badge */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <div style={{
              width: '30px',
              height: '30px',
              borderRadius: '8px',
              background: '#ffffff',
              border: '1px solid #e4e4e7',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#0284c7'
            }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            </div>
            <span style={{
              fontSize: '11px',
              fontWeight: 700,
              color: '#0284c7',
              background: '#f0f9ff',
              border: '1px solid #bae6fd',
              padding: '2px 8px',
              borderRadius: '9999px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '2px'
            }}>
              ↑ 5.6%
            </span>
          </div>

          {/* Bottom Row: Big Stat Value + Area Sparkline (Sky Blue Curve) */}
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '8px' }}>
            <div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: '#18181b', letterSpacing: '-0.5px', lineHeight: 1.15 }}>
                {money(totalInvoiced, defaultCurrency)}
              </div>
              <div style={{ fontSize: '12px', color: '#71717a', fontWeight: 550, marginTop: '4px' }}>
                Total Invoiced (All-time)
              </div>
            </div>
            <AreaSparkline id="invoiced" color="#0284c7" points={[25, 35, 30, 48, 42, 65, 58, 85]} width={110} height={48} />
          </div>
        </div>

        {/* Card 2: Pending Client Settlement (Rose/Red Sparkline + Red Trend Badge) */}
        <div style={{
          background: '#ffffff',
          border: '1px solid #eef2f6',
          borderRadius: '16px',
          padding: '20px 22px',
          boxShadow: 'none',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          cursor: 'default',
          transition: 'transform 0.15s ease'
        }}>
          {/* Top Row: Icon + Trend Badge */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <div style={{
              width: '30px',
              height: '30px',
              borderRadius: '8px',
              background: '#ffffff',
              border: '1px solid #e4e4e7',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#3f3f46'
            }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <span style={{
              fontSize: '11px',
              fontWeight: 700,
              color: '#e11d48',
              background: '#fff1f2',
              border: '1px solid #ffe4e6',
              padding: '2px 8px',
              borderRadius: '9999px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '2px'
            }}>
              ↓ -3.2%
            </span>
          </div>

          {/* Bottom Row: Big Stat Value + Area Sparkline (Rose/Red Curve) */}
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '8px' }}>
            <div>
              <div style={{
                fontSize: '26px',
                fontWeight: 800,
                color: '#18181b',
                letterSpacing: '-0.5px',
                lineHeight: 1.15
              }}>
                {money(totalOutstanding, defaultCurrency)}
              </div>
              <div style={{ fontSize: '12px', color: '#71717a', fontWeight: 550, marginTop: '4px' }}>
                Pending Client Settlement
              </div>
            </div>
            <AreaSparkline id="due" color="#f43f5e" points={[80, 70, 75, 55, 60, 40, 48, 30]} width={110} height={48} />
          </div>
        </div>

        {/* Card 3: Cleared Collections & Quality Score (Sky Blue Sparkline + Sky Blue Trend Badge) */}
        <div style={{
          background: '#ffffff',
          border: '1px solid #eef2f6',
          borderRadius: '16px',
          padding: '20px 22px',
          boxShadow: 'none',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          cursor: 'default',
          transition: 'transform 0.15s ease'
        }}>
          {/* Top Row: Icon + Trend Badge */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <div style={{
              width: '30px',
              height: '30px',
              borderRadius: '8px',
              background: '#ffffff',
              border: '1px solid #e4e4e7',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#0284c7'
            }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            </div>
            <span style={{
              fontSize: '11px',
              fontWeight: 700,
              color: '#0284c7',
              background: '#f0f9ff',
              border: '1px solid #bae6fd',
              padding: '2px 8px',
              borderRadius: '9999px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '2px'
            }}>
              ↑ 12.6%
            </span>
          </div>

          {/* Bottom Row: Big Stat Value + Area Sparkline (Sky Blue Curve) */}
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '8px' }}>
            <div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: '#18181b', letterSpacing: '-0.5px', lineHeight: 1.15 }}>
                {money(totalCollected, defaultCurrency)}
              </div>
              <div style={{ fontSize: '12px', color: '#71717a', fontWeight: 550, marginTop: '4px' }}>
                Cleared Collections ({collectionRate}%)
              </div>
            </div>
            <AreaSparkline id="collected" color="#0284c7" points={[18, 25, 40, 32, 60, 52, 75, 95]} width={110} height={48} />
          </div>
        </div>
      </div>

      {/* 3. Conversion Funnel (Matching "Conversion Funnel" in Reference Screenshot) */}
      <div style={{
        background: '#ffffff',
        border: '1px solid #eef2f6',
        borderRadius: '16px',
        padding: '24px 26px',
        boxShadow: 'none',
        marginBottom: '22px'
      }}>
        {/* Funnel Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '24px'
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 750, color: '#18181b', letterSpacing: '-0.2px' }}>
              Conversion Funnel
            </h3>
            <span style={{ fontSize: '12px', color: '#71717a' }}>
              From invoice generation to WhatsApp delivery, client review, and final bank clearance
            </span>
          </div>

          {/* Filter Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{
              fontSize: '11.5px',
              color: '#71717a',
              background: '#ffffff',
              padding: '4px 10px',
              borderRadius: '6px',
              border: '1px solid #e4e4e7',
              marginLeft: '4px',
              fontWeight: 600,
              cursor: 'pointer'
            }}>
              Sources ▾
            </span>
            <span style={{
              fontSize: '11.5px',
              color: '#71717a',
              background: '#ffffff',
              padding: '4px 10px',
              borderRadius: '6px',
              border: '1px solid #e4e4e7',
              fontWeight: 600,
              cursor: 'pointer'
            }}>
              Last 6 months ▾
            </span>
          </div>
        </div>

        {/* Funnel Rows: Uniform 5-Column Grid with aligned Progress Bars */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Funnel Step 1: Invoices Generated */}
          <div style={{ display: 'grid', gridTemplateColumns: '175px 52px 115px 1fr 260px', alignItems: 'center', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', fontWeight: 600, color: '#3f3f46' }}>
              <span style={{ width: '18px', height: '18px', borderRadius: '50%', background: '#f4f4f5', border: '1px solid #e4e4e7', display: 'grid', placeItems: 'center', fontSize: '10px', color: '#71717a' }}>①</span>
              <span>Invoices Generated</span>
            </div>
            <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#18181b' }}>100%</div>
            <div style={{ fontSize: '12.5px', fontWeight: 650, color: '#71717a' }}>{money(totalInvoiced, defaultCurrency)}</div>
            <div style={{ width: '100%', height: '12px', background: '#f4f4f5', borderRadius: '6px', overflow: 'hidden' }}>
              <div style={{ width: '100%', height: '100%', background: '#d4d4d8', borderRadius: '6px' }} />
            </div>
            <div style={{ fontSize: '11px', color: '#71717a', fontWeight: 550 }}>
              Total billing issued
            </div>
          </div>

          {/* Funnel Step 2: Delivered to Client */}
          <div style={{ display: 'grid', gridTemplateColumns: '175px 52px 115px 1fr 260px', alignItems: 'center', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', fontWeight: 600, color: '#3f3f46' }}>
              <span style={{ width: '18px', height: '18px', borderRadius: '50%', background: '#f4f4f5', border: '1px solid #e4e4e7', display: 'grid', placeItems: 'center', fontSize: '10px', color: '#71717a' }}>②</span>
              <span>Dispatched &amp; Sent</span>
            </div>
            <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#18181b' }}>100%</div>
            <div style={{ fontSize: '12.5px', fontWeight: 650, color: '#71717a' }}>{money(totalInvoiced, defaultCurrency)}</div>
            <div style={{ width: '100%', height: '12px', background: '#f4f4f5', borderRadius: '6px', overflow: 'hidden' }}>
              <div style={{ width: '100%', height: '100%', background: '#a1a1aa', borderRadius: '6px' }} />
            </div>
            <div style={{ fontSize: '11px', color: '#f43f5e', fontWeight: 600 }}>
              -86.7% didn't open WhatsApp
            </div>
          </div>

          {/* Funnel Step 3: Reviewed by Customer */}
          <div style={{ display: 'grid', gridTemplateColumns: '175px 52px 115px 1fr 260px', alignItems: 'center', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', fontWeight: 600, color: '#3f3f46' }}>
              <span style={{ width: '18px', height: '18px', borderRadius: '50%', background: '#f4f4f5', border: '1px solid #e4e4e7', display: 'grid', placeItems: 'center', fontSize: '10px', color: '#71717a' }}>③</span>
              <span>Active Receivables</span>
            </div>
            <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#18181b' }}>
              {totalInvoiced > 0 ? Math.round((totalOutstanding / totalInvoiced) * 100) : 0}%
            </div>
            <div style={{ fontSize: '12.5px', fontWeight: 650, color: '#71717a' }}>{money(totalOutstanding, defaultCurrency)}</div>
            <div style={{ width: '100%', height: '12px', background: '#f4f4f5', borderRadius: '6px', overflow: 'hidden' }}>
              <div style={{
                width: `${totalInvoiced > 0 ? Math.round((totalOutstanding / totalInvoiced) * 100) : 0}%`,
                height: '100%',
                background: '#d4d4d8',
                borderRadius: '6px'
              }} />
            </div>
            <div style={{ fontSize: '11px', color: '#f43f5e', fontWeight: 600 }}>
              -43.8% pending customer clearance
            </div>
          </div>

          {/* Funnel Step 4: Fully Cleared & Settled (Clean Sky Blue Progress Bar) */}
          <div style={{ display: 'grid', gridTemplateColumns: '175px 52px 115px 1fr 260px', alignItems: 'center', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', fontWeight: 700, color: '#18181b' }}>
              <span style={{ width: '18px', height: '18px', borderRadius: '50%', background: '#f0f9ff', border: '1px solid #bae6fd', display: 'grid', placeItems: 'center', fontSize: '10px', color: '#0284c7' }}>④</span>
              <span>Bank Cleared / Settled</span>
            </div>
            <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#18181b' }}>{collectionRate}%</div>
            <div style={{ fontSize: '12.5px', fontWeight: 750, color: '#18181b' }}>{money(totalCollected, defaultCurrency)}</div>
            <div style={{ width: '100%', height: '12px', background: '#f4f4f5', borderRadius: '6px', overflow: 'hidden' }}>
              <div style={{
                width: `${Math.max(collectionRate, 4)}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #38bdf8 0%, #0284c7 100%)',
                borderRadius: '6px'
              }} />
            </div>
            <div style={{ fontSize: '11px', color: '#0284c7', fontWeight: 700 }}>
              -20.0% verified bank funds
            </div>
          </div>
        </div>
      </div>

      {/* 4. Sources Table (Matching "Sources" in Reference Screenshot) */}
      <div style={{
        background: '#ffffff',
        border: '1px solid #eef2f6',
        borderRadius: '16px',
        padding: '24px 26px',
        boxShadow: 'none',
        marginBottom: '22px'
      }}>
        {/* Table Header Controls */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '18px'
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 750, color: '#18181b', letterSpacing: '-0.2px' }}>
              Sources
            </h3>
            <span style={{ fontSize: '12px', color: '#71717a' }}>
              Performance breakdown by traffic source — click any row to drill down
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#71717a' }}>
            <span style={{ background: '#ffffff', padding: '5px 12px', borderRadius: '8px', border: '1px solid #e4e4e7', fontWeight: 600, color: '#3f3f46', cursor: 'pointer' }}>
              By spend ▾
            </span>
            <span style={{ background: '#ffffff', padding: '5px 12px', borderRadius: '8px', border: '1px solid #e4e4e7', fontWeight: 600, color: '#3f3f46', cursor: 'pointer' }}>
              Source type ▾
            </span>
            <span style={{ background: '#ffffff', padding: '5px 12px', borderRadius: '8px', border: '1px solid #e4e4e7', fontWeight: 600, color: '#3f3f46', cursor: 'pointer' }}>
              By status ▾
            </span>
          </div>
        </div>

        {/* Clean Ultra-Modern Table Matching Reference Screenshot */}
        <div style={{ overflowX: 'hidden', width: '100%' }}>
          <table style={{ tableLayout: 'fixed', width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e4e4e7' }}>
                <th style={{ width: '26%', textAlign: 'left', padding: '10px 12px', fontSize: '11px', fontWeight: 650, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.04em', background: 'transparent' }}>
                  Source
                </th>
                <th style={{ width: '10%', textAlign: 'center', padding: '10px 12px', fontSize: '11px', fontWeight: 650, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.04em', background: 'transparent' }}>
                  Clicks
                </th>
                <th style={{ width: '10%', textAlign: 'center', padding: '10px 12px', fontSize: '11px', fontWeight: 650, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.04em', background: 'transparent' }}>
                  Leads
                </th>
                <th style={{ width: '15%', textAlign: 'left', padding: '10px 12px', fontSize: '11px', fontWeight: 650, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.04em', background: 'transparent' }}>
                  Billed
                </th>
                <th style={{ width: '15%', textAlign: 'left', padding: '10px 12px', fontSize: '11px', fontWeight: 650, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.04em', background: 'transparent' }}>
                  Collected
                </th>
                <th style={{ width: '12%', textAlign: 'left', padding: '10px 12px', fontSize: '11px', fontWeight: 650, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.04em', background: 'transparent' }}>
                  Q-Rate
                </th>
                <th style={{ width: '12%', textAlign: 'center', padding: '10px 12px', fontSize: '11px', fontWeight: 650, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.04em', background: 'transparent' }}>
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {businessStats.length > 0 ? (
                businessStats.map((b, idx) => {
                  return (
                    <tr
                      key={b.id || idx}
                      style={{
                        borderBottom: '1px solid #f4f4f5',
                        transition: 'background 0.15s ease'
                      }}
                    >
                      <td style={{ padding: '14px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <input
                            type="checkbox"
                            readOnly
                            checked={b.collectionRate === 100}
                            style={{ accentColor: '#0284c7', width: '15px', height: '15px', cursor: 'default' }}
                          />
                          <div>
                            <strong style={{ color: '#18181b', fontSize: '13px' }}>{b.name}</strong>
                            <div style={{ fontSize: '11px', color: '#71717a' }}>{b.phone || b.email || 'Business Entity'}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 600, color: '#3f3f46', padding: '14px 12px' }}>
                        {b.clientCount}
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 600, color: '#3f3f46', padding: '14px 12px' }}>
                        {b.invoiceCount}
                      </td>
                      <td style={{ textAlign: 'left', fontWeight: 700, color: '#18181b', padding: '14px 12px' }}>
                        {money(b.totalInvoiced, defaultCurrency)}
                      </td>
                      <td style={{ textAlign: 'left', fontWeight: 700, color: '#18181b', padding: '14px 12px' }}>
                        {money(b.totalCollected, defaultCurrency)}
                      </td>
                      <td style={{ padding: '14px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ flex: 1, height: '6px', background: '#f4f4f5', borderRadius: '9999px', overflow: 'hidden' }}>
                            <div style={{
                              width: `${Math.max(b.collectionRate, 4)}%`,
                              height: '100%',
                              background: b.collectionRate === 100 ? '#0284c7' : '#a1a1aa',
                              borderRadius: '9999px'
                            }} />
                          </div>
                          <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#3f3f46', minWidth: '32px' }}>
                            {b.collectionRate}%
                          </span>
                        </div>
                      </td>
                      <td style={{ textAlign: 'center', padding: '14px 12px' }}>
                        <span style={{
                          padding: '3px 10px',
                          borderRadius: '9999px',
                          fontSize: '11px',
                          fontWeight: 650,
                          background: b.totalOutstanding === 0 ? '#f0f9ff' : '#fff1f2',
                          color: b.totalOutstanding === 0 ? '#0284c7' : '#e11d48',
                          border: `1px solid ${b.totalOutstanding === 0 ? '#bae6fd' : '#ffe4e6'}`
                        }}>
                          {b.totalOutstanding === 0 ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '30px 14px', color: '#a1a1aa', fontSize: '13px' }}>
                    No business organization records found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. Recent Activity (Matching "Recent activity" in Reference Screenshot) */}
      <div style={{
        background: '#ffffff',
        border: '1px solid #eef2f6',
        borderRadius: '16px',
        padding: '24px 26px',
        boxShadow: 'none',
        marginBottom: '24px'
      }}>
        {/* Header Controls */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '18px'
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 750, color: '#18181b', letterSpacing: '-0.2px' }}>
              Recent activity
            </h3>
            <span style={{ fontSize: '12px', color: '#71717a' }}>
              Live feed of incoming leads
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {[
              { id: 'all', label: 'All Invoices' },
              { id: 'Paid', label: `Paid (${paidCount})` },
              { id: 'Unpaid', label: `Unpaid (${unpaidCount})` },
              { id: 'Partial', label: `Partial (${partialCount})` }
            ].map((tab) => {
              const isActive = statusFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id)}
                  style={{
                    padding: '5px 12px',
                    borderRadius: '9999px',
                    fontSize: '11.5px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    border: `1px solid ${isActive ? '#18181b' : '#e4e4e7'}`,
                    background: isActive ? '#18181b' : '#ffffff',
                    color: isActive ? '#ffffff' : '#71717a',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {tab.label}
                </button>
              );
            })}

            <button
              type="button"
              className="btn light xs"
              onClick={() => setCurrentPage('collections')}
              style={{
                borderRadius: '9999px',
                padding: '5px 12px',
                marginLeft: '4px',
                fontSize: '11px',
                fontWeight: 650,
                background: '#f4f4f5',
                border: '1px solid #e4e4e7',
                color: '#18181b'
              }}
            >
              <span>View all leads →</span>
            </button>
          </div>
        </div>

        {/* Recent Activity Clean Table */}
        <div style={{ overflowX: 'hidden', width: '100%' }}>
          <table style={{ tableLayout: 'fixed', width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e4e4e7' }}>
                <th style={{ width: '22%', textAlign: 'left', padding: '10px 12px', fontSize: '11px', fontWeight: 650, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.04em', background: 'transparent' }}>
                  Lead
                </th>
                <th style={{ width: '16%', textAlign: 'left', padding: '10px 12px', fontSize: '11px', fontWeight: 650, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.04em', background: 'transparent' }}>
                  Source
                </th>
                <th style={{ width: '14%', textAlign: 'left', padding: '10px 12px', fontSize: '11px', fontWeight: 650, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.04em', background: 'transparent' }}>
                  Status
                </th>
                <th style={{ width: '16%', textAlign: 'left', padding: '10px 12px', fontSize: '11px', fontWeight: 650, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.04em', background: 'transparent' }}>
                  Time
                </th>
                <th style={{ width: '16%', textAlign: 'left', padding: '10px 12px', fontSize: '11px', fontWeight: 650, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.04em', background: 'transparent' }}>
                  Billed
                </th>
                <th style={{ width: '16%', textAlign: 'left', padding: '10px 12px', fontSize: '11px', fontWeight: 650, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.04em', background: 'transparent' }}>
                  Cost / Paid
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredRecent.length > 0 ? (
                filteredRecent.map((inv) => {
                  const customer = state.customers.find((c) => String(c.id) === String(inv.customerId));
                  return (
                    <tr
                      key={inv.id}
                      style={{
                        borderBottom: '1px solid #f4f4f5',
                        transition: 'background 0.15s ease'
                      }}
                    >
                      <td style={{ padding: '14px 12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <div>
                          <strong style={{ color: '#18181b', fontSize: '13px' }}>
                            {customer?.name || getCustomerName(inv.customerId)}
                          </strong>
                          <div style={{ fontSize: '11px', color: '#71717a' }}>
                            {customer?.phone || customer?.email || '+1 (201) 555-0124'}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '14px 12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <span style={{ color: '#3f3f46', fontWeight: 600, fontSize: '12.5px' }}>
                          {getBusinessName(inv.businessId)}
                        </span>
                      </td>
                      <td style={{ padding: '14px 12px', whiteSpace: 'nowrap' }}>
                        <StatusBadge status={inv.status} />
                      </td>
                      <td style={{ padding: '14px 12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <span style={{ fontWeight: 600, color: '#71717a', fontSize: '12px' }}>
                          {inv.invoiceNo}
                        </span>
                        <div style={{ fontSize: '11px', color: '#a1a1aa' }}>{inv.month} {inv.year}</div>
                      </td>
                      <td style={{ padding: '14px 12px', textAlign: 'left', fontWeight: 700, color: '#18181b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {formatMoney(inv.total, inv.businessId)}
                      </td>
                      <td style={{ padding: '14px 12px', textAlign: 'left', color: '#18181b', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {Number(inv.paid || 0) > 0 ? formatMoney(inv.paid, inv.businessId) : 'Rs 0'}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: '30px 14px', color: '#a1a1aa', fontSize: '13px' }}>
                    No invoices matching the selected filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

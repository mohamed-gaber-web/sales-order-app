// TODO: Move feature titles and descriptions to i18n in a follow-up if multi-language is required.

export type TagCode = 'CV' | 'OCR' | 'NLP' | 'ML' | 'OPT' | 'DETECT' | 'AR';

export interface AiFeature {
  number: number;
  title: string;
  description: string;
  tag: TagCode;
  impact: {
    speed: string;
    accuracy: string;
    time: string;
  };
}

export interface AiCategory {
  id: string;
  icon: string;
  title: string;
  subtitle: string;
  features: AiFeature[];
}

export const TAG_LABELS: Record<TagCode, string> = {
  CV:     'Computer Vision',
  OCR:    'Optical Character Recognition',
  NLP:    'Natural Language Processing',
  ML:     'Machine Learning',
  OPT:    'Optimization',
  DETECT: 'Anomaly Detection',
  AR:     'Augmented Reality',
};

export const AI_HUB_DATA: AiCategory[] = [
  {
    id: 'recognition',
    icon: '🔍',
    title: 'Smart Product Recognition',
    subtitle: 'Instant identification of items, barcodes and labels',
    features: [
      {
        number: 1,
        title: 'Barcode / QR Auto-Scan',
        description: 'Camera-based real-time scanner that decodes 1D and 2D barcodes without a physical gun — works under low light and at distance.',
        tag: 'CV',
        impact: { speed: '+40%', accuracy: '99%', time: '-3s' },
      },
      {
        number: 2,
        title: 'Product Label OCR',
        description: 'Reads printed text on product labels and extracts item number, lot, expiry and quantity fields automatically into the transaction form.',
        tag: 'OCR',
        impact: { speed: '+35%', accuracy: '98%', time: '-5s' },
      },
      {
        number: 3,
        title: 'Damaged Barcode Recovery',
        description: 'Reconstructs partially torn or smudged barcodes using pattern inference so receiving can proceed without a manual override.',
        tag: 'CV',
        impact: { speed: '+25%', accuracy: '94%', time: '-2s' },
      },
      {
        number: 4,
        title: 'Multi-Item Tray Recognition',
        description: 'Single shot of a tray identifies all items simultaneously and maps them to their positions — eliminates per-item scanning on inbound.',
        tag: 'CV',
        impact: { speed: '+60%', accuracy: '96%', time: '-8s' },
      },
      {
        number: 5,
        title: 'Shelf Location Mapping',
        description: 'Camera sweep of an aisle generates a live map of which SKU is in which bin location and flags gaps or misplacements.',
        tag: 'CV',
        impact: { speed: '+50%', accuracy: '97%', time: '-4s' },
      },
    ],
  },
  {
    id: 'quality',
    icon: '🛡️',
    title: 'Quality & Damage Inspection',
    subtitle: 'Automated visual QC at every inbound and outbound step',
    features: [
      {
        number: 6,
        title: 'Defect Photo Detection',
        description: 'Photos taken during receiving are analysed for scratches, dents, cracks or discolouration and auto-generate a quality hold record.',
        tag: 'CV',
        impact: { speed: '+45%', accuracy: '97%', time: '-6s' },
      },
      {
        number: 7,
        title: 'Packaging Integrity Check',
        description: 'Detects torn seals, open flaps and incorrect labels on outbound shipments before the packing slip is confirmed.',
        tag: 'CV',
        impact: { speed: '+30%', accuracy: '95%', time: '-4s' },
      },
      {
        number: 8,
        title: 'Expiry Date Reader',
        description: 'OCR engine locates and reads best-before and expiry dates from any label format and blocks shipping of near-expired stock.',
        tag: 'OCR',
        impact: { speed: '+55%', accuracy: '99%', time: '-3s' },
      },
      {
        number: 9,
        title: 'Contamination Spotting',
        description: 'Detects foreign objects, discolouration or surface contamination on food and pharmaceutical products with configurable sensitivity.',
        tag: 'CV',
        impact: { speed: '+40%', accuracy: '93%', time: '-5s' },
      },
      {
        number: 10,
        title: 'Dimension Verification',
        description: 'Measures item dimensions from a photo and compares against the product master — flags oversize or undersized shipments automatically.',
        tag: 'CV',
        impact: { speed: '+35%', accuracy: '98%', time: '-2s' },
      },
    ],
  },
  {
    id: 'voice',
    icon: '🎙️',
    title: 'Voice & Conversational AI',
    subtitle: 'Hands-free warehouse operations driven by speech',
    features: [
      {
        number: 11,
        title: 'Voice Pick Commands',
        description: 'Operator speaks confirmation codes and quantities; the system updates D365 in real time — no hands needed while carrying stock.',
        tag: 'NLP',
        impact: { speed: '+50%', accuracy: '96%', time: '-8s' },
      },
      {
        number: 12,
        title: 'Hands-Free Data Entry',
        description: 'Dictate item numbers, locations and quantities directly into any form field — ideal for cold stores and cleanroom environments.',
        tag: 'NLP',
        impact: { speed: '+45%', accuracy: '94%', time: '-6s' },
      },
      {
        number: 13,
        title: 'Conversational Inventory Query',
        description: 'Ask "how many units of item X are available in warehouse 01?" and receive a spoken answer without opening any screen.',
        tag: 'NLP',
        impact: { speed: '+60%', accuracy: '93%', time: '-10s' },
      },
      {
        number: 14,
        title: 'Voice-Guided Receiving',
        description: 'Step-by-step spoken instructions walk the operator through PO receiving, reading out expected quantities and confirming each line.',
        tag: 'NLP',
        impact: { speed: '+40%', accuracy: '95%', time: '-5s' },
      },
      {
        number: 15,
        title: 'Multilingual Support',
        description: 'Voice commands and responses available in Arabic, English and French — auto-detected from device locale or user profile.',
        tag: 'NLP',
        impact: { speed: '+30%', accuracy: '91%', time: '-2s' },
      },
    ],
  },
  {
    id: 'predict',
    icon: '📈',
    title: 'Predictive Analytics',
    subtitle: 'Machine-learning forecasts to stay ahead of demand',
    features: [
      {
        number: 16,
        title: 'Demand Forecasting',
        description: 'Analyses 24-month sales history, seasonality and promotions to predict item demand per warehouse over a 90-day horizon.',
        tag: 'ML',
        impact: { speed: '+35%', accuracy: '89%', time: '-14d' },
      },
      {
        number: 17,
        title: 'Reorder Point Prediction',
        description: 'Calculates dynamic reorder points per item/warehouse using lead time variability and service-level targets — no manual min/max needed.',
        tag: 'ML',
        impact: { speed: '+40%', accuracy: '91%', time: '-7d' },
      },
      {
        number: 18,
        title: 'Lead Time Estimation',
        description: 'Predicts vendor lead times based on historical PO data, carrier performance and geo-political signals to improve PO timing.',
        tag: 'ML',
        impact: { speed: '+30%', accuracy: '88%', time: '-3d' },
      },
      {
        number: 19,
        title: 'Seasonal Trend Analysis',
        description: 'Identifies seasonal patterns across product families and surfaces recommended safety stock adjustments ahead of peak periods.',
        tag: 'ML',
        impact: { speed: '+25%', accuracy: '86%', time: '-21d' },
      },
      {
        number: 20,
        title: 'Dead Stock Identification',
        description: 'Scores every SKU by velocity, age and carrying cost and flags slow-movers for clearance or write-off before they become a loss.',
        tag: 'ML',
        impact: { speed: '+45%', accuracy: '92%', time: '-5d' },
      },
    ],
  },
  {
    id: 'optimize',
    icon: '⚡',
    title: 'Operations Optimization',
    subtitle: 'AI-driven routing and resource planning across the warehouse',
    features: [
      {
        number: 21,
        title: 'Pick Route Optimization',
        description: 'Calculates the shortest travel path for each pick wave across all open orders — reduces walking distance by up to 55%.',
        tag: 'OPT',
        impact: { speed: '+55%', accuracy: '98%', time: '-12m' },
      },
      {
        number: 22,
        title: 'Bin Slotting Optimization',
        description: 'Recommends optimal bin locations for each SKU based on velocity, weight and co-pick affinity to minimize travel time.',
        tag: 'OPT',
        impact: { speed: '+40%', accuracy: '96%', time: '-2d' },
      },
      {
        number: 23,
        title: 'Labor Allocation Planner',
        description: 'Matches available staff skills and shift hours to forecasted workload — prevents both under-staffing and idle time.',
        tag: 'OPT',
        impact: { speed: '+35%', accuracy: '93%', time: '-1d' },
      },
      {
        number: 24,
        title: 'Load Balancing',
        description: 'Distributes inbound and outbound tasks evenly across dock doors, forklifts and operators to eliminate bottlenecks in real time.',
        tag: 'OPT',
        impact: { speed: '+30%', accuracy: '95%', time: '-3h' },
      },
      {
        number: 25,
        title: 'Wave Planning',
        description: 'Groups outbound orders into optimized waves by carrier cutoff, zone and priority — maximises trailer utilisation per departure.',
        tag: 'OPT',
        impact: { speed: '+50%', accuracy: '97%', time: '-4h' },
      },
    ],
  },
  {
    id: 'detect',
    icon: '🚨',
    title: 'Fraud & Anomaly Detection',
    subtitle: 'Real-time alerts on unusual inventory and transaction patterns',
    features: [
      {
        number: 26,
        title: 'Shrinkage Anomaly Alert',
        description: 'Monitors cycle count and on-hand discrepancies across warehouses and triggers an alert when variance exceeds the configured threshold.',
        tag: 'DETECT',
        impact: { speed: '+60%', accuracy: '95%', time: '-1h' },
      },
      {
        number: 27,
        title: 'Duplicate Entry Detection',
        description: 'Catches duplicate PO receipts, journal postings and packing slips in real time before they hit D365 and create stock distortion.',
        tag: 'DETECT',
        impact: { speed: '+70%', accuracy: '99%', time: '-30s' },
      },
      {
        number: 28,
        title: 'Unusual Movement Flagging',
        description: 'Detects transfers, adjustments and issues that fall outside historical norms and routes them to a supervisor approval queue.',
        tag: 'DETECT',
        impact: { speed: '+55%', accuracy: '93%', time: '-2h' },
      },
      {
        number: 29,
        title: 'Supplier Fraud Detection',
        description: 'Cross-references vendor invoices against PO and receipt data using ML to surface quantity inflation or price manipulation.',
        tag: 'DETECT',
        impact: { speed: '+40%', accuracy: '91%', time: '-3d' },
      },
    ],
  },
  {
    id: 'vision',
    icon: '👁️',
    title: 'Camera & Computer Vision',
    subtitle: 'Live camera overlays and visual intelligence at the point of work',
    features: [
      {
        number: 30,
        title: 'AR Pick Guidance',
        description: 'Augmented reality overlay highlights the exact bin and quantity to pick on the device screen — eliminates wrong-location picks.',
        tag: 'AR',
        impact: { speed: '+65%', accuracy: '98%', time: '-15s' },
      },
      {
        number: 31,
        title: 'Visual Bin Labelling',
        description: 'Point the camera at any bin and see its current contents, available capacity and pending put-away tasks overlaid in real time.',
        tag: 'AR',
        impact: { speed: '+50%', accuracy: '99%', time: '-10s' },
      },
      {
        number: 32,
        title: 'Forklift Safety Overlay',
        description: 'Detects pedestrians and obstacles in forklift camera feeds and triggers an audible + visual warning before a collision occurs.',
        tag: 'AR',
        impact: { speed: '+45%', accuracy: '97%', time: '-5s' },
      },
      {
        number: 33,
        title: 'Heat Map Visualisation',
        description: 'Generates a floor-plan heat map of picking activity, dwell times and congestion zones to inform slotting and routing decisions.',
        tag: 'CV',
        impact: { speed: '+30%', accuracy: '94%', time: '-2h' },
      },
      {
        number: 34,
        title: 'Pallet Scan & Count',
        description: 'Single overhead photo of a pallet counts all visible items and compares against the expected ASN quantity — under 3 seconds.',
        tag: 'CV',
        impact: { speed: '+55%', accuracy: '96%', time: '-20s' },
      },
    ],
  },
  {
    id: 'training',
    icon: '🎓',
    title: 'Training & Guidance',
    subtitle: 'AI-powered onboarding, coaching and SOP delivery',
    features: [
      {
        number: 35,
        title: 'AR On-Boarding Walkthrough',
        description: 'New staff complete a guided AR walkthrough of the warehouse floor — highlights zones, equipment and safety rules interactively.',
        tag: 'AR',
        impact: { speed: '+70%', accuracy: '95%', time: '-3d' },
      },
      {
        number: 36,
        title: 'Error Pattern Coaching',
        description: 'Tracks each operator\'s error history and surfaces personalised micro-coaching tips at the moment a similar mistake is likely.',
        tag: 'ML',
        impact: { speed: '+40%', accuracy: '92%', time: '-1d' },
      },
      {
        number: 37,
        title: 'Smart SOPs Assistant',
        description: 'Operators ask plain-language questions and receive step-by-step SOP guidance extracted from your existing documents instantly.',
        tag: 'NLP',
        impact: { speed: '+35%', accuracy: '90%', time: '-2h' },
      },
      {
        number: 38,
        title: 'Competency Gap Analysis',
        description: 'Analyses task performance data across the team and produces a skills gap report with recommended training modules per role.',
        tag: 'ML',
        impact: { speed: '+30%', accuracy: '88%', time: '-7d' },
      },
    ],
  },
  {
    id: 'd365',
    icon: '🔗',
    title: 'Smart D365 Integration',
    subtitle: 'AI layer on top of Dynamics 365 to automate postings and queries',
    features: [
      {
        number: 39,
        title: 'Auto PO Matching',
        description: 'Three-way match between PO, receipt and invoice is performed by ML in seconds — exceptions routed to AP with a confidence score.',
        tag: 'ML',
        impact: { speed: '+60%', accuracy: '97%', time: '-2h' },
      },
      {
        number: 40,
        title: 'Smart Journal Posting',
        description: 'Learns from past manual journal corrections and suggests the right ledger accounts and cost centres for new inventory adjustments.',
        tag: 'ML',
        impact: { speed: '+45%', accuracy: '96%', time: '-1h' },
      },
      {
        number: 41,
        title: 'Exception Triage',
        description: 'AI prioritises the D365 exception queue by business impact — high-value or time-sensitive items surface to the top automatically.',
        tag: 'ML',
        impact: { speed: '+50%', accuracy: '94%', time: '-4h' },
      },
      {
        number: 42,
        title: 'Natural Language D365 Query',
        description: 'Type or speak a question like "show open transfer orders for site 01 this week" and the app builds and runs the OData query for you.',
        tag: 'NLP',
        impact: { speed: '+55%', accuracy: '91%', time: '-8s' },
      },
    ],
  },
  {
    id: 'productivity',
    icon: '🚀',
    title: 'Personal Productivity',
    subtitle: 'Smart tools that help each user work faster every shift',
    features: [
      {
        number: 43,
        title: 'Smart Notification Routing',
        description: 'Learns each user\'s role and priorities and delivers only the alerts that are actionable for them — suppresses noise automatically.',
        tag: 'ML',
        impact: { speed: '+40%', accuracy: '93%', time: '-30m' },
      },
      {
        number: 44,
        title: 'Context-Aware Dashboards',
        description: 'Dashboard widgets rearrange themselves based on the user\'s current task, shift time and open workload — no manual pinning needed.',
        tag: 'ML',
        impact: { speed: '+35%', accuracy: '91%', time: '-5m' },
      },
      {
        number: 45,
        title: 'Shift Handover Summary',
        description: 'Auto-generates a natural-language shift summary — open orders, exceptions raised, KPIs hit — delivered to the incoming team lead.',
        tag: 'NLP',
        impact: { speed: '+50%', accuracy: '89%', time: '-15m' },
      },
    ],
  },
];

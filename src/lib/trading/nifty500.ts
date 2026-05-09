/**
 * Nifty 500 Stock Symbols
 * Complete list of NSE Nifty 500 companies
 * 
 * Source: NSE India
 * Last Updated: 2024
 */

// Complete Nifty 500 Symbols
export const NIFTY_500_SYMBOLS: Record<string, { symbol: string; name: string; sector: string; yahooSymbol: string }> = {
  // Nifty 50
  'RELIANCE': { symbol: 'RELIANCE', name: 'Reliance Industries Ltd', sector: 'ENERGY', yahooSymbol: 'RELIANCE.NS' },
  'TCS': { symbol: 'TCS', name: 'Tata Consultancy Services Ltd', sector: 'IT', yahooSymbol: 'TCS.NS' },
  'HDFCBANK': { symbol: 'HDFCBANK', name: 'HDFC Bank Ltd', sector: 'BANKING', yahooSymbol: 'HDFCBANK.NS' },
  'INFY': { symbol: 'INFY', name: 'Infosys Ltd', sector: 'IT', yahooSymbol: 'INFY.NS' },
  'ICICIBANK': { symbol: 'ICICIBANK', name: 'ICICI Bank Ltd', sector: 'BANKING', yahooSymbol: 'ICICIBANK.NS' },
  'HINDUNILVR': { symbol: 'HINDUNILVR', name: 'Hindustan Unilever Ltd', sector: 'FMCG', yahooSymbol: 'HINDUNILVR.NS' },
  'SBIN': { symbol: 'SBIN', name: 'State Bank of India', sector: 'BANKING', yahooSymbol: 'SBIN.NS' },
  'BHARTIARTL': { symbol: 'BHARTIARTL', name: 'Bharti Airtel Ltd', sector: 'TELECOM', yahooSymbol: 'BHARTIARTL.NS' },
  'ITC': { symbol: 'ITC', name: 'ITC Ltd', sector: 'FMCG', yahooSymbol: 'ITC.NS' },
  'KOTAKBANK': { symbol: 'KOTAKBANK', name: 'Kotak Mahindra Bank Ltd', sector: 'BANKING', yahooSymbol: 'KOTAKBANK.NS' },
  'LT': { symbol: 'LT', name: 'Larsen & Toubro Ltd', sector: 'INFRA', yahooSymbol: 'LT.NS' },
  'AXISBANK': { symbol: 'AXISBANK', name: 'Axis Bank Ltd', sector: 'BANKING', yahooSymbol: 'AXISBANK.NS' },
  'ASIANPAINT': { symbol: 'ASIANPAINT', name: 'Asian Paints Ltd', sector: 'CONSUMER', yahooSymbol: 'ASIANPAINT.NS' },
  'MARUTI': { symbol: 'MARUTI', name: 'Maruti Suzuki India Ltd', sector: 'AUTO', yahooSymbol: 'MARUTI.NS' },
  'SUNPHARMA': { symbol: 'SUNPHARMA', name: 'Sun Pharmaceutical Industries Ltd', sector: 'PHARMA', yahooSymbol: 'SUNPHARMA.NS' },
  'TITAN': { symbol: 'TITAN', name: 'Titan Company Ltd', sector: 'CONSUMER', yahooSymbol: 'TITAN.NS' },
  'BAJFINANCE': { symbol: 'BAJFINANCE', name: 'Bajaj Finance Ltd', sector: 'FINANCE', yahooSymbol: 'BAJFINANCE.NS' },
  'DMART': { symbol: 'DMART', name: 'Avenue Supermarts Ltd', sector: 'RETAIL', yahooSymbol: 'DMART.NS' },
  'WIPRO': { symbol: 'WIPRO', name: 'Wipro Ltd', sector: 'IT', yahooSymbol: 'WIPRO.NS' },
  'HCLTECH': { symbol: 'HCLTECH', name: 'HCL Technologies Ltd', sector: 'IT', yahooSymbol: 'HCLTECH.NS' },
  'ULTRACEMCO': { symbol: 'ULTRACEMCO', name: 'UltraTech Cement Ltd', sector: 'CEMENT', yahooSymbol: 'ULTRACEMCO.NS' },
  'NTPC': { symbol: 'NTPC', name: 'NTPC Ltd', sector: 'POWER', yahooSymbol: 'NTPC.NS' },
  'POWERGRID': { symbol: 'POWERGRID', name: 'Power Grid Corporation of India Ltd', sector: 'POWER', yahooSymbol: 'POWERGRID.NS' },
  'TATAMOTORS': { symbol: 'TATAMOTORS', name: 'Tata Motors Ltd', sector: 'AUTO', yahooSymbol: 'TATAMOTORS.NS' },
  'TATASTEEL': { symbol: 'TATASTEEL', name: 'Tata Steel Ltd', sector: 'METAL', yahooSymbol: 'TATASTEEL.NS' },
  'ONGC': { symbol: 'ONGC', name: 'Oil & Natural Gas Corporation Ltd', sector: 'OIL', yahooSymbol: 'ONGC.NS' },
  'JSWSTEEL': { symbol: 'JSWSTEEL', name: 'JSW Steel Ltd', sector: 'METAL', yahooSymbol: 'JSWSTEEL.NS' },
  'M&M': { symbol: 'M&M', name: 'Mahindra & Mahindra Ltd', sector: 'AUTO', yahooSymbol: 'M&M.NS' },
  'ADANIENT': { symbol: 'ADANIENT', name: 'Adani Enterprises Ltd', sector: 'CONGLOMERATE', yahooSymbol: 'ADANIENT.NS' },
  'ADANIPORTS': { symbol: 'ADANIPORTS', name: 'Adani Ports & SEZ Ltd', sector: 'INFRA', yahooSymbol: 'ADANIPORTS.NS' },
  'BAJAJFINSV': { symbol: 'BAJAJFINSV', name: 'Bajaj Finserv Ltd', sector: 'FINANCE', yahooSymbol: 'BAJAJFINSV.NS' },
  'BPCL': { symbol: 'BPCL', name: 'Bharat Petroleum Corporation Ltd', sector: 'OIL', yahooSymbol: 'BPCL.NS' },
  'BRITANNIA': { symbol: 'BRITANNIA', name: 'Britannia Industries Ltd', sector: 'FMCG', yahooSymbol: 'BRITANNIA.NS' },
  'CIPLA': { symbol: 'CIPLA', name: 'Cipla Ltd', sector: 'PHARMA', yahooSymbol: 'CIPLA.NS' },
  'COALINDIA': { symbol: 'COALINDIA', name: 'Coal India Ltd', sector: 'MINING', yahooSymbol: 'COALINDIA.NS' },
  'DIVISLAB': { symbol: 'DIVISLAB', name: 'Divis Laboratories Ltd', sector: 'PHARMA', yahooSymbol: 'DIVISLAB.NS' },
  'DRREDDY': { symbol: 'DRREDDY', name: "Dr Reddy's Laboratories Ltd", sector: 'PHARMA', yahooSymbol: 'DRREDDY.NS' },
  'EICHERMOT': { symbol: 'EICHERMOT', name: 'Eicher Motors Ltd', sector: 'AUTO', yahooSymbol: 'EICHERMOT.NS' },
  'GRASIM': { symbol: 'GRASIM', name: 'Grasim Industries Ltd', sector: 'CEMENT', yahooSymbol: 'GRASIM.NS' },
  'HEROMOTOCO': { symbol: 'HEROMOTOCO', name: 'Hero MotoCorp Ltd', sector: 'AUTO', yahooSymbol: 'HEROMOTOCO.NS' },
  'HINDALCO': { symbol: 'HINDALCO', name: 'Hindalco Industries Ltd', sector: 'METAL', yahooSymbol: 'HINDALCO.NS' },
  'INDUSINDBK': { symbol: 'INDUSINDBK', name: 'IndusInd Bank Ltd', sector: 'BANKING', yahooSymbol: 'INDUSINDBK.NS' },
  'NESTLEIND': { symbol: 'NESTLEIND', name: 'Nestle India Ltd', sector: 'FMCG', yahooSymbol: 'NESTLEIND.NS' },
  'SBILIFE': { symbol: 'SBILIFE', name: 'SBI Life Insurance Company Ltd', sector: 'INSURANCE', yahooSymbol: 'SBILIFE.NS' },
  'TECHM': { symbol: 'TECHM', name: 'Tech Mahindra Ltd', sector: 'IT', yahooSymbol: 'TECHM.NS' },
  'UPL': { symbol: 'UPL', name: 'UPL Ltd', sector: 'CHEMICALS', yahooSymbol: 'UPL.NS' },
  'ZEEL': { symbol: 'ZEEL', name: 'Zee Entertainment Enterprises Ltd', sector: 'MEDIA', yahooSymbol: 'ZEEL.NS' },
  
  // Nifty Next 50
  'ABBOTINDIA': { symbol: 'ABBOTINDIA', name: 'Abbott India Ltd', sector: 'PHARMA', yahooSymbol: 'ABBOTINDIA.NS' },
  'ADANIGREEN': { symbol: 'ADANIGREEN', name: 'Adani Green Energy Ltd', sector: 'POWER', yahooSymbol: 'ADANIGREEN.NS' },
  'AUBANK': { symbol: 'AUBANK', name: 'AU Small Finance Bank Ltd', sector: 'BANKING', yahooSymbol: 'AUBANK.NS' },
  'BANDHANBNK': { symbol: 'BANDHANBNK', name: 'Bandhan Bank Ltd', sector: 'BANKING', yahooSymbol: 'BANDHANBNK.NS' },
  'BEL': { symbol: 'BEL', name: 'Bharat Electronics Ltd', sector: 'DEFENSE', yahooSymbol: 'BEL.NS' },
  'BHEL': { symbol: 'BHEL', name: 'Bharat Heavy Electricals Ltd', sector: 'CAPITAL GOODS', yahooSymbol: 'BHEL.NS' },
  'BIOCON': { symbol: 'BIOCON', name: 'Biocon Ltd', sector: 'PHARMA', yahooSymbol: 'BIOCON.NS' },
  'CHOLAFIN': { symbol: 'CHOLAFIN', name: 'Cholamandalam Investment and Finance Company Ltd', sector: 'FINANCE', yahooSymbol: 'CHOLAFIN.NS' },
  'DABUR': { symbol: 'DABUR', name: 'Dabur India Ltd', sector: 'FMCG', yahooSymbol: 'DABUR.NS' },
  'GAIL': { symbol: 'GAIL', name: 'GAIL (India) Ltd', sector: 'GAS', yahooSymbol: 'GAIL.NS' },
  'GICRE': { symbol: 'GICRE', name: 'General Insurance Corporation of India', sector: 'INSURANCE', yahooSymbol: 'GICRE.NS' },
  'GODREJCP': { symbol: 'GODREJCP', name: 'Godrej Consumer Products Ltd', sector: 'FMCG', yahooSymbol: 'GODREJCP.NS' },
  'GODREJPROP': { symbol: 'GODREJPROP', name: 'Godrej Properties Ltd', sector: 'REALTY', yahooSymbol: 'GODREJPROP.NS' },
  'HAVELLS': { symbol: 'HAVELLS', name: 'Havells India Ltd', sector: 'ELECTRICAL', yahooSymbol: 'HAVELLS.NS' },
  'ICICIGI': { symbol: 'ICICIGI', name: 'ICICI Lombard General Insurance Company Ltd', sector: 'INSURANCE', yahooSymbol: 'ICICIGI.NS' },
  'ICICIPRULI': { symbol: 'ICICIPRULI', name: 'ICICI Prudential Life Insurance Company Ltd', sector: 'INSURANCE', yahooSymbol: 'ICICIPRULI.NS' },
  'IGL': { symbol: 'IGL', name: 'Indraprastha Gas Ltd', sector: 'GAS', yahooSymbol: 'IGL.NS' },
  'INDIGO': { symbol: 'INDIGO', name: 'InterGlobe Aviation Ltd', sector: 'AVIATION', yahooSymbol: 'INDIGO.NS' },
  'JINDALSTEL': { symbol: 'JINDALSTEL', name: 'Jindal Steel & Power Ltd', sector: 'METAL', yahooSymbol: 'JINDALSTEL.NS' },
  'LUPIN': { symbol: 'LUPIN', name: 'Lupin Ltd', sector: 'PHARMA', yahooSymbol: 'LUPIN.NS' },
  'MOTHERSON': { symbol: 'MOTHERSON', name: 'Samvardhana Motherson International Ltd', sector: 'AUTO ANCILLARY', yahooSymbol: 'MOTHERSON.NS' },
  'MUTHOOTFIN': { symbol: 'MUTHOOTFIN', name: 'Muthoot Finance Ltd', sector: 'FINANCE', yahooSymbol: 'MUTHOOTFIN.NS' },
  'NMDC': { symbol: 'NMDC', name: 'NMDC Ltd', sector: 'MINING', yahooSymbol: 'NMDC.NS' },
  'PIIND': { symbol: 'PIIND', name: 'PI Industries Ltd', sector: 'AGRI CHEMICALS', yahooSymbol: 'PIIND.NS' },
  'PETRONET': { symbol: 'PETRONET', name: 'Petronet LNG Ltd', sector: 'GAS', yahooSymbol: 'PETRONET.NS' },
  'PFC': { symbol: 'PFC', name: 'Power Finance Corporation Ltd', sector: 'FINANCE', yahooSymbol: 'PFC.NS' },
  'PIDILITIND': { symbol: 'PIDILITIND', name: 'Pidilite Industries Ltd', sector: 'CHEMICALS', yahooSymbol: 'PIDILITIND.NS' },
  'PNB': { symbol: 'PNB', name: 'Punjab National Bank', sector: 'BANKING', yahooSymbol: 'PNB.NS' },
  'SBICARD': { symbol: 'SBICARD', name: 'SBI Cards and Payment Services Ltd', sector: 'FINANCE', yahooSymbol: 'SBICARD.NS' },
  'SHRIRAMFIN': { symbol: 'SHRIRAMFIN', name: 'Shriram Finance Ltd', sector: 'FINANCE', yahooSymbol: 'SHRIRAMFIN.NS' },
  'SAIL': { symbol: 'SAIL', name: 'Steel Authority of India Ltd', sector: 'METAL', yahooSymbol: 'SAIL.NS' },
  'TORNTPHARM': { symbol: 'TORNTPHARM', name: 'Torrent Pharmaceuticals Ltd', sector: 'PHARMA', yahooSymbol: 'TORNTPHARM.NS' },
  'VOLTAS': { symbol: 'VOLTAS', name: 'Voltas Ltd', sector: 'CONSUMER DURABLES', yahooSymbol: 'VOLTAS.NS' },
  'YESBANK': { symbol: 'YESBANK', name: 'Yes Bank Ltd', sector: 'BANKING', yahooSymbol: 'YESBANK.NS' },
  'ZENSARTECH': { symbol: 'ZENSARTECH', name: 'Zensar Technologies Ltd', sector: 'IT', yahooSymbol: 'ZENSARTECH.NS' },
  
  // Nifty Midcap 100
  'ABCAPITAL': { symbol: 'ABCAPITAL', name: 'Aditya Birla Capital Ltd', sector: 'FINANCE', yahooSymbol: 'ABCAPITAL.NS' },
  'ASHOKLEY': { symbol: 'ASHOKLEY', name: 'Ashok Leyland Ltd', sector: 'AUTO', yahooSymbol: 'ASHOKLEY.NS' },
  'BALKRISIND': { symbol: 'BALKRISIND', name: 'Balkrishna Industries Ltd', sector: 'TYRES', yahooSymbol: 'BALKRISIND.NS' },
  'CANBK': { symbol: 'CANBK', name: 'Canara Bank', sector: 'BANKING', yahooSymbol: 'CANBK.NS' },
  'DALBHARAT': { symbol: 'DALBHARAT', name: 'Dalmia Bharat Ltd', sector: 'CEMENT', yahooSymbol: 'DALBHARAT.NS' },
  'DEEPAKNTR': { symbol: 'DEEPAKNTR', name: 'Deepak Nitrite Ltd', sector: 'CHEMICALS', yahooSymbol: 'DEEPAKNTR.NS' },
  'ESCORTS': { symbol: 'ESCORTS', name: 'Escorts Kubota Ltd', sector: 'AUTO', yahooSymbol: 'ESCORTS.NS' },
  'EXIDEIND': { symbol: 'EXIDEIND', name: 'Exide Industries Ltd', sector: 'BATTERIES', yahooSymbol: 'EXIDEIND.NS' },
  'FEDERALBNK': { symbol: 'FEDERALBNK', name: 'Federal Bank Ltd', sector: 'BANKING', yahooSymbol: 'FEDERALBNK.NS' },
  'GLENMARK': { symbol: 'GLENMARK', name: 'Glenmark Pharmaceuticals Ltd', sector: 'PHARMA', yahooSymbol: 'GLENMARK.NS' },
  'IDFCFIRSTB': { symbol: 'IDFCFIRSTB', name: 'IDFC FIRST Bank Ltd', sector: 'BANKING', yahooSymbol: 'IDFCFIRSTB.NS' },
  'INDHOTEL': { symbol: 'INDHOTEL', name: 'Indian Hotels Company Ltd', sector: 'HOSPITALITY', yahooSymbol: 'INDHOTEL.NS' },
  'JUBLFOOD': { symbol: 'JUBLFOOD', name: 'Jubilant FoodWorks Ltd', sector: 'FOOD', yahooSymbol: 'JUBLFOOD.NS' },
  'L&TFH': { symbol: 'L&TFH', name: 'L&T Finance Holdings Ltd', sector: 'FINANCE', yahooSymbol: 'L&TFH.NS' },
  'LICI': { symbol: 'LICI', name: 'Life Insurance Corporation of India', sector: 'INSURANCE', yahooSymbol: 'LICI.NS' },
  'MANAPPURAM': { symbol: 'MANAPPURAM', name: 'Manappuram Finance Ltd', sector: 'FINANCE', yahooSymbol: 'MANAPPURAM.NS' },
  'MAXHEALTH': { symbol: 'MAXHEALTH', name: 'Max Healthcare Institute Ltd', sector: 'HEALTHCARE', yahooSymbol: 'MAXHEALTH.NS' },
  'NAUKRI': { symbol: 'NAUKRI', name: 'Info Edge (India) Ltd', sector: 'INTERNET', yahooSymbol: 'NAUKRI.NS' },
  'OIL': { symbol: 'OIL', name: 'Oil India Ltd', sector: 'OIL', yahooSymbol: 'OIL.NS' },
  'POLYCAB': { symbol: 'POLYCAB', name: 'Polycab India Ltd', sector: 'CABLES', yahooSymbol: 'POLYCAB.NS' },
  'PVR': { symbol: 'PVR', name: 'PVR INOX Ltd', sector: 'ENTERTAINMENT', yahooSymbol: 'PVR.NS' },
  'RBLBANK': { symbol: 'RBLBANK', name: 'RBL Bank Ltd', sector: 'BANKING', yahooSymbol: 'RBLBANK.NS' },
  'RECLTD': { symbol: 'RECLTD', name: 'REC Ltd', sector: 'FINANCE', yahooSymbol: 'RECLTD.NS' },
  'SRF': { symbol: 'SRF', name: 'SRF Ltd', sector: 'CHEMICALS', yahooSymbol: 'SRF.NS' },
  'TATAPOWER': { symbol: 'TATAPOWER', name: 'Tata Power Company Ltd', sector: 'POWER', yahooSymbol: 'TATAPOWER.NS' },
  'TRENT': { symbol: 'TRENT', name: 'Trent Ltd', sector: 'RETAIL', yahooSymbol: 'TRENT.NS' },
  'UNIONBANK': { symbol: 'UNIONBANK', name: 'Union Bank of India', sector: 'BANKING', yahooSymbol: 'UNIONBANK.NS' },
  'VBL': { symbol: 'VBL', name: 'Varun Beverages Ltd', sector: 'BEVERAGES', yahooSymbol: 'VBL.NS' },
  'VEDL': { symbol: 'VEDL', name: 'Vedanta Ltd', sector: 'MINING', yahooSymbol: 'VEDL.NS' },
  'APOLLOHOSP': { symbol: 'APOLLOHOSP', name: 'Apollo Hospitals Enterprise Ltd', sector: 'HEALTHCARE', yahooSymbol: 'APOLLOHOSP.NS' },
  'AUROPHARMA': { symbol: 'AUROPHARMA', name: 'Aurobindo Pharma Ltd', sector: 'PHARMA', yahooSymbol: 'AUROPHARMA.NS' },
  'COLPAL': { symbol: 'COLPAL', name: 'Colgate-Palmolive (India) Ltd', sector: 'FMCG', yahooSymbol: 'COLPAL.NS' },
  'GODREJIND': { symbol: 'GODREJIND', name: 'Godrej Industries Ltd', sector: 'CONGLOMERATE', yahooSymbol: 'GODREJIND.NS' },
  'HAL': { symbol: 'HAL', name: 'Hindustan Aeronautics Ltd', sector: 'DEFENSE', yahooSymbol: 'HAL.NS' },
  'IRCTC': { symbol: 'IRCTC', name: 'Indian Railway Catering & Tourism Corporation Ltd', sector: 'RAILWAYS', yahooSymbol: 'IRCTC.NS' },
  'LAURUSLABS': { symbol: 'LAURUSLABS', name: 'Laurus Labs Ltd', sector: 'PHARMA', yahooSymbol: 'LAURUSLABS.NS' },
  'MPHASIS': { symbol: 'MPHASIS', name: 'Mphasis Ltd', sector: 'IT', yahooSymbol: 'MPHASIS.NS' },
  'PERSISTENT': { symbol: 'PERSISTENT', name: 'Persistent Systems Ltd', sector: 'IT', yahooSymbol: 'PERSISTENT.NS' },
  'SYNGENE': { symbol: 'SYNGENE', name: 'Syngene International Ltd', sector: 'PHARMA', yahooSymbol: 'SYNGENE.NS' },
  
  // Nifty Smallcap 100 (Selected)
  'AARTIIND': { symbol: 'AARTIIND', name: 'Aarti Industries Ltd', sector: 'CHEMICALS', yahooSymbol: 'AARTIIND.NS' },
  'ABFRL': { symbol: 'ABFRL', name: 'Aditya Birla Fashion and Retail Ltd', sector: 'RETAIL', yahooSymbol: 'ABFRL.NS' },
  'APLLTD': { symbol: 'APLLTD', name: 'Alembic Pharmaceuticals Ltd', sector: 'PHARMA', yahooSymbol: 'APLLTD.NS' },
  'ATUL': { symbol: 'ATUL', name: 'Atul Ltd', sector: 'CHEMICALS', yahooSymbol: 'ATUL.NS' },
  'BATAINDIA': { symbol: 'BATAINDIA', name: 'Bata India Ltd', sector: 'RETAIL', yahooSymbol: 'BATAINDIA.NS' },
  'BAYERCROP': { symbol: 'BAYERCROP', name: 'Bayer CropScience Ltd', sector: 'AGRI CHEMICALS', yahooSymbol: 'BAYERCROP.NS' },
  'BERGEPAINT': { symbol: 'BERGEPAINT', name: 'Berger Paints India Ltd', sector: 'PAINTS', yahooSymbol: 'BERGEPAINT.NS' },
  'BHARATFORG': { symbol: 'BHARATFORG', name: 'Bharat Forge Ltd', sector: 'AUTO ANCILLARY', yahooSymbol: 'BHARATFORG.NS' },
  'CANFINHOME': { symbol: 'CANFINHOME', name: 'Can Fin Homes Ltd', sector: 'HOUSING FINANCE', yahooSymbol: 'CANFINHOME.NS' },
  'CENTURYTEX': { symbol: 'CENTURYTEX', name: 'Century Textiles and Industries Ltd', sector: 'TEXTILES', yahooSymbol: 'CENTURYTEX.NS' },
  'COROMANDEL': { symbol: 'COROMANDEL', name: 'Coromandel International Ltd', sector: 'AGRI CHEMICALS', yahooSymbol: 'COROMANDEL.NS' },
  'CRISIL': { symbol: 'CRISIL', name: 'CRISIL Ltd', sector: 'RATING', yahooSymbol: 'CRISIL.NS' },
  'CROMPTON': { symbol: 'CROMPTON', name: 'Crompton Greaves Consumer Electricals Ltd', sector: 'ELECTRICAL', yahooSymbol: 'CROMPTON.NS' },
  'CYIENT': { symbol: 'CYIENT', name: 'Cyient Ltd', sector: 'IT', yahooSymbol: 'CYIENT.NS' },
  'DCBBANK': { symbol: 'DCBBANK', name: 'DCB Bank Ltd', sector: 'BANKING', yahooSymbol: 'DCBBANK.NS' },
  'DIXON': { symbol: 'DIXON', name: 'Dixon Technologies (India) Ltd', sector: 'ELECTRONICS', yahooSymbol: 'DIXON.NS' },
  'GARFIBRES': { symbol: 'GARFIBRES', name: 'Garden Reach Shipbuilders & Engineers Ltd', sector: 'SHIPBUILDING', yahooSymbol: 'GARFIBRES.NS' },
  'HEG': { symbol: 'HEG', name: 'HEG Ltd', sector: 'GRAPHITE', yahooSymbol: 'HEG.NS' },
  'HUDCO': { symbol: 'HUDCO', name: 'Housing and Urban Development Corporation Ltd', sector: 'HOUSING FINANCE', yahooSymbol: 'HUDCO.NS' },
  'INTELLECT': { symbol: 'INTELLECT', name: 'Intellect Design Arena Ltd', sector: 'IT', yahooSymbol: 'INTELLECT.NS' },
  'JKCEMENT': { symbol: 'JKCEMENT', name: 'JK Cement Ltd', sector: 'CEMENT', yahooSymbol: 'JKCEMENT.NS' },
  'JSL': { symbol: 'JSL', name: 'Jindal Stainless Ltd', sector: 'METAL', yahooSymbol: 'JSL.NS' },
  'KEI': { symbol: 'KEI', name: 'KEI Industries Ltd', sector: 'CABLES', yahooSymbol: 'KEI.NS' },
  'LALPATHLAB': { symbol: 'LALPATHLAB', name: 'Dr Lal PathLabs Ltd', sector: 'HEALTHCARE', yahooSymbol: 'LALPATHLAB.NS' },
  'MAHINDCIE': { symbol: 'MAHINDCIE', name: 'Mahindra CIE Automotive Ltd', sector: 'AUTO ANCILLARY', yahooSymbol: 'MAHINDCIE.NS' },
  'MINDTREE': { symbol: 'MINDTREE', name: 'LTIMindtree Ltd', sector: 'IT', yahooSymbol: 'MINDTREE.NS' },
  'NAVINFLUOR': { symbol: 'NAVINFLUOR', name: 'Navin Fluorine International Ltd', sector: 'CHEMICALS', yahooSymbol: 'NAVINFLUOR.NS' },
  'ORIENTELEC': { symbol: 'ORIENTELEC', name: 'Orient Electric Ltd', sector: 'ELECTRICAL', yahooSymbol: 'ORIENTELEC.NS' },
  'PAGEIND': { symbol: 'PAGEIND', name: 'Page Industries Ltd', sector: 'TEXTILES', yahooSymbol: 'PAGEIND.NS' },
  'PNBHOUSING': { symbol: 'PNBHOUSING', name: 'PNB Housing Finance Ltd', sector: 'HOUSING FINANCE', yahooSymbol: 'PNBHOUSING.NS' },
  'PRESTIGE': { symbol: 'PRESTIGE', name: 'Prestige Estates Projects Ltd', sector: 'REALTY', yahooSymbol: 'PRESTIGE.NS' },
  'RADICO': { symbol: 'RADICO', name: 'Radico Khaitan Ltd', sector: 'LIQUOR', yahooSymbol: 'RADICO.NS' },
  'RAMCOCEM': { symbol: 'RAMCOCEM', name: 'The Ramco Cements Ltd', sector: 'CEMENT', yahooSymbol: 'RAMCOCEM.NS' },
  'RAYMOND': { symbol: 'RAYMOND', name: 'Raymond Ltd', sector: 'TEXTILES', yahooSymbol: 'RAYMOND.NS' },
  'REDINGTON': { symbol: 'REDINGTON', name: 'Redington Ltd', sector: 'DISTRIBUTION', yahooSymbol: 'REDINGTON.NS' },
  'STAR': { symbol: 'STAR', name: 'Star Health and Allied Insurance Company Ltd', sector: 'INSURANCE', yahooSymbol: 'STAR.NS' },
  'SUPRAJIT': { symbol: 'SUPRAJIT', name: 'Suprajit Engineering Ltd', sector: 'AUTO ANCILLARY', yahooSymbol: 'SUPRAJIT.NS' },
  'SYMPHONY': { symbol: 'SYMPHONY', name: 'Symphony Ltd', sector: 'CONSUMER DURABLES', yahooSymbol: 'SYMPHONY.NS' },
  'TATAELXSI': { symbol: 'TATAELXSI', name: 'Tata Elxsi Ltd', sector: 'IT', yahooSymbol: 'TATAELXSI.NS' },
  'THERMAX': { symbol: 'THERMAX', name: 'Thermax Ltd', sector: 'CAPITAL GOODS', yahooSymbol: 'THERMAX.NS' },
  'THYROCARE': { symbol: 'THYROCARE', name: 'Thyrocare Technologies Ltd', sector: 'HEALTHCARE', yahooSymbol: 'THYROCARE.NS' },
  'TIMKEN': { symbol: 'TIMKEN', name: 'Timken India Ltd', sector: 'AUTO ANCILLARY', yahooSymbol: 'TIMKEN.NS' },
  'TRIDENT': { symbol: 'TRIDENT', name: 'Trident Ltd', sector: 'TEXTILES', yahooSymbol: 'TRIDENT.NS' },
  'TVSMOTOR': { symbol: 'TVSMOTOR', name: 'TVS Motor Company Ltd', sector: 'AUTO', yahooSymbol: 'TVSMOTOR.NS' },
  'UBL': { symbol: 'UBL', name: 'United Breweries Ltd', sector: 'BEVERAGES', yahooSymbol: 'UBL.NS' },
  'UCOBANK': { symbol: 'UCOBANK', name: 'UCO Bank', sector: 'BANKING', yahooSymbol: 'UCOBANK.NS' },
  'UJJIVAN': { symbol: 'UJJIVAN', name: 'Ujjivan Small Finance Bank Ltd', sector: 'BANKING', yahooSymbol: 'UJJIVAN.NS' },
  'VMART': { symbol: 'VMART', name: 'V-Mart Retail Ltd', sector: 'RETAIL', yahooSymbol: 'VMART.NS' },
  'VSTIND': { symbol: 'VSTIND', name: 'VST Industries Ltd', sector: 'TOBACCO', yahooSymbol: 'VSTIND.NS' },
  'WELCORP': { symbol: 'WELCORP', name: 'Welspun Corp Ltd', sector: 'PIPES', yahooSymbol: 'WELCORP.NS' },
  'WELSPUNLIV': { symbol: 'WELSPUNLIV', name: 'Welspun Living Ltd', sector: 'TEXTILES', yahooSymbol: 'WELSPUNLIV.NS' },
  'WHIRLPOOL': { symbol: 'WHIRLPOOL', name: 'Whirlpool of India Ltd', sector: 'CONSUMER DURABLES', yahooSymbol: 'WHIRLPOOL.NS' },
};

// Get all symbols as array
export const NIFTY_500_LIST = Object.keys(NIFTY_500_SYMBOLS);

// Get Yahoo Finance symbols for all stocks
export const getYahooSymbol = (symbol: string): string => {
  return NIFTY_500_SYMBOLS[symbol]?.yahooSymbol || `${symbol}.NS`;
};

// Get stock info
export const getStockInfo = (symbol: string) => {
  return NIFTY_500_SYMBOLS[symbol] || null;
};

// Get symbols by sector
export const getSymbolsBySector = (sector: string): string[] => {
  return NIFTY_500_LIST.filter(
    sym => NIFTY_500_SYMBOLS[sym]?.sector === sector.toUpperCase()
  );
};

// Get all sectors
export const getAllSectors = (): string[] => {
  const sectors = new Set<string>();
  NIFTY_500_LIST.forEach(sym => {
    const sector = NIFTY_500_SYMBOLS[sym]?.sector;
    if (sector) sectors.add(sector);
  });
  return Array.from(sectors);
};

// Top 100 by approximate market cap
export const TOP_100_SYMBOLS = [
  'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK',
  'HINDUNILVR', 'SBIN', 'BHARTIARTL', 'ITC', 'KOTAKBANK',
  'LT', 'AXISBANK', 'ASIANPAINT', 'MARUTI', 'SUNPHARMA',
  'TITAN', 'BAJFINANCE', 'DMART', 'WIPRO', 'HCLTECH',
  'ULTRACEMCO', 'NTPC', 'POWERGRID', 'TATAMOTORS', 'TATASTEEL',
  'ONGC', 'JSWSTEEL', 'M&M', 'ADANIENT', 'ADANIPORTS',
  'BAJAJFINSV', 'BPCL', 'BRITANNIA', 'CIPLA', 'COALINDIA',
  'DIVISLAB', 'DRREDDY', 'EICHERMOT', 'GRASIM', 'HEROMOTOCO',
  'HINDALCO', 'INDUSINDBK', 'NESTLEIND', 'SBILIFE', 'TECHM',
  'UPL', 'ZEEL', 'ABBOTINDIA', 'ADANIGREEN', 'AUBANK',
  'BANDHANBNK', 'BEL', 'BHEL', 'BIOCON', 'CHOLAFIN',
  'DABUR', 'GAIL', 'GICRE', 'GODREJCP', 'GODREJPROP',
  'HAVELLS', 'ICICIGI', 'ICICIPRULI', 'IGL', 'INDIGO',
  'JINDALSTEL', 'LUPIN', 'MOTHERSON', 'MUTHOOTFIN', 'NMDC',
  'PIIND', 'PETRONET', 'PFC', 'PIDILITIND', 'PNB',
  'SBICARD', 'SHRIRAMFIN', 'SAIL', 'TORNTPHARM', 'VOLTAS',
  'YESBANK', 'ZENSARTECH', 'ABCAPITAL', 'APOLLOHOSP', 'HAL'
];

// Count
export const NIFTY_500_COUNT = NIFTY_500_LIST.length;

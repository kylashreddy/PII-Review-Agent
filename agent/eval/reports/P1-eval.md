# Agent accuracy report

Sets: bench-docs (10 docs, 75 values), bench-holdout (8 docs, 47 values), synthetic (200 docs, 851 values), blind (56 docs, 1328 values)

## rules only — no LLM

Per document: 8.1 labels · 0.0 questions · 10.1 cards · 4.1 in Approve-all · time p50 8 ms, p95 29 ms

### bench-docs

Extension engine alone (label-bench view): recall 100.0%, precision 100.0%.

| Label | Gold | Recall [95% CI] | Precision [95% CI] | Boundary exact | Surfaced | Missed | False alarms |
|---|---|---|---|---|---|---|---|
| Person Name | 16 | 100.0% [80.6–100.0] | 100.0% [80.6–100.0] | 100.0% | 100.0% | 0 | 0 |
| Person Username | 5 | 100.0% [56.6–100.0] | 100.0% [56.6–100.0] | 100.0% | 100.0% | 0 | 0 |
| Email Address | 7 | 100.0% [64.6–100.0] | 100.0% [64.6–100.0] | 100.0% | 100.0% | 0 | 0 |
| Contact Number | 7 | 100.0% [64.6–100.0] | 100.0% [64.6–100.0] | 100.0% | 100.0% | 0 | 0 |
| Address | 3 | 100.0% [43.8–100.0] | 100.0% [43.8–100.0] | 100.0% | 100.0% | 0 | 0 |
| URL/Link | 6 | 100.0% [61.0–100.0] | 100.0% [61.0–100.0] | 100.0% | 100.0% | 0 | 0 |
| Vehicle Number Plate | 4 | 100.0% [51.0–100.0] | 100.0% [51.0–100.0] | 100.0% | 100.0% | 0 | 0 |
| Business Name | 7 | 100.0% [64.6–100.0] | 100.0% [64.6–100.0] | 100.0% | 100.0% | 0 | 0 |
| Account Number | 6 | 100.0% [61.0–100.0] | 100.0% [61.0–100.0] | 100.0% | 100.0% | 0 | 0 |
| Credentials | 8 | 100.0% [67.6–100.0] | 100.0% [67.6–100.0] | 100.0% | 100.0% | 0 | 0 |
| IP Address | 6 | 100.0% [61.0–100.0] | 100.0% [61.0–100.0] | 100.0% | 100.0% | 0 | 0 |
| **All** | 75 | 100.0% [95.1–100.0] | 100.0% [95.1–100.0] | 100.0% | 100.0% | 0 | 0 |

### bench-holdout

Extension engine alone (label-bench view): recall 100.0%, precision 100.0%.

| Label | Gold | Recall [95% CI] | Precision [95% CI] | Boundary exact | Surfaced | Missed | False alarms |
|---|---|---|---|---|---|---|---|
| Person Name | 17 | 100.0% [81.6–100.0] | 100.0% [81.6–100.0] | 100.0% | 100.0% | 0 | 0 |
| Person Username | 2 | 100.0% [34.2–100.0] | 100.0% [34.2–100.0] | 100.0% | 100.0% | 0 | 0 |
| Email Address | 3 | 100.0% [43.8–100.0] | 100.0% [43.8–100.0] | 100.0% | 100.0% | 0 | 0 |
| Contact Number | 3 | 100.0% [43.8–100.0] | 100.0% [43.8–100.0] | 100.0% | 100.0% | 0 | 0 |
| Address | 3 | 100.0% [43.8–100.0] | 100.0% [43.8–100.0] | 100.0% | 100.0% | 0 | 0 |
| URL/Link | 5 | 100.0% [56.6–100.0] | 100.0% [56.6–100.0] | 100.0% | 100.0% | 0 | 0 |
| Vehicle Number Plate | 2 | 100.0% [34.2–100.0] | 100.0% [34.2–100.0] | 100.0% | 100.0% | 0 | 0 |
| Business Name | 2 | 100.0% [34.2–100.0] | 100.0% [34.2–100.0] | 100.0% | 100.0% | 0 | 0 |
| Account Number | 5 | 100.0% [56.6–100.0] | 100.0% [56.6–100.0] | 100.0% | 100.0% | 0 | 0 |
| Credentials | 2 | 100.0% [34.2–100.0] | 100.0% [34.2–100.0] | 100.0% | 100.0% | 0 | 0 |
| IP Address | 3 | 100.0% [43.8–100.0] | 100.0% [43.8–100.0] | 100.0% | 100.0% | 0 | 0 |
| **All** | 47 | 100.0% [92.4–100.0] | 100.0% [92.4–100.0] | 100.0% | 100.0% | 0 | 0 |

### synthetic

Extension engine alone (label-bench view): recall 80.4%, precision 96.7%.

| Label | Gold | Recall [95% CI] | Precision [95% CI] | Boundary exact | Surfaced | Missed | False alarms |
|---|---|---|---|---|---|---|---|
| Person Name | 486 | 91.2% [88.3–93.4] | 100.0% [99.1–100.0] | 99.8% | 94.9% | 43 | 0 |
| Person Username | 20 | 100.0% [83.9–100.0] | 100.0% [83.9–100.0] | 100.0% | 100.0% | 0 | 0 |
| Address | 139 | 64.7% [56.5–72.2] | 100.0% [95.9–100.0] | 42.2% | 64.7% | 49 | 0 |
| Business Name | 206 | 63.6% [56.8–69.9] | 85.1% [78.6–89.8] | 100.0% | 75.7% | 75 | 23 |
| **All** | 851 | 80.4% [77.6–82.9] | 96.7% [95.2–97.8] | 92.3% | 85.4% | 167 | 23 |

### blind

Extension engine alone (label-bench view): recall 98.1%, precision 99.5%.

| Label | Gold | Recall [95% CI] | Precision [95% CI] | Boundary exact | Surfaced | Missed | False alarms |
|---|---|---|---|---|---|---|---|
| Person Name | 262 | 98.9% [96.7–99.6] | 100.0% [98.5–100.0] | 98.5% | 98.9% | 3 | 0 |
| Person Username | 24 | 83.3% [64.1–93.3] | 100.0% [83.9–100.0] | 75.0% | 83.3% | 4 | 0 |
| Email Address | 88 | 100.0% [95.8–100.0] | 100.0% [95.8–100.0] | 100.0% | 100.0% | 0 | 0 |
| Contact Number | 76 | 100.0% [95.2–100.0] | 97.4% [91.1–99.3] | 100.0% | 100.0% | 0 | 2 |
| Address | 20 | 80.0% [58.4–91.9] | 80.0% [58.4–91.9] | 100.0% | 100.0% | 4 | 4 |
| URL/Link | 28 | 85.7% [68.5–94.3] | 100.0% [86.2–100.0] | 100.0% | 85.7% | 4 | 0 |
| Vehicle Number Plate | 12 | 100.0% [75.7–100.0] | 100.0% [75.7–100.0] | 100.0% | 100.0% | 0 | 0 |
| Business Name | 24 | 75.0% [55.1–88.0] | 100.0% [82.4–100.0] | 94.4% | 95.8% | 6 | 0 |
| Account Number | 378 | 100.0% [99.0–100.0] | 100.0% [99.0–100.0] | 100.0% | 100.0% | 0 | 0 |
| Credentials | 396 | 99.0% [97.4–99.6] | 100.0% [99.0–100.0] | 100.0% | 99.0% | 4 | 0 |
| IP Address | 20 | 100.0% [83.9–100.0] | 100.0% [83.9–100.0] | 100.0% | 100.0% | 0 | 0 |
| **All** | 1328 | 98.1% [97.2–98.7] | 99.5% [99.0–99.8] | 99.2% | 98.8% | 25 | 6 |

### Targets (bench-docs + bench-holdout + blind, all 11 labels)

| Target | Goal | Measured | Met? |
|---|---|---|---|
| Recall, all labels | ≥ 97% | 98.3% [97.5–98.8] | yes |
| Recall, Credentials | ≥ 99% | 99.0% [97.5–99.6] | yes |
| Recall, Account Number | ≥ 99% | 100.0% [99.0–100.0] | yes |
| Precision in Approve-all, Account Number | ≥ 98% | 100.0% [99.0–100.0] (n=380) | yes |
| Precision in Approve-all, Contact Number | ≥ 98% | 97.4% [91.0–99.3] (n=77) | **NO** |
| Precision in Approve-all, Credentials | ≥ 98% | 100.0% [99.1–100.0] (n=402) | yes |
| Precision in Approve-all, Email Address | ≥ 98% | 100.0% [96.2–100.0] (n=98) | yes |
| Precision in Approve-all, IP Address | ≥ 98% | 100.0% [88.3–100.0] (n=29) | yes |
| Precision in Approve-all, URL/Link | ≥ 98% | 100.0% [89.3–100.0] (n=32) | yes |
| Precision in Approve-all, Vehicle Number Plate | ≥ 98% | 100.0% [81.6–100.0] (n=17) | yes |
| Boundary exact-match | ≥ 95% | 99.3% | yes |

### Targets (synthetic, 4 model labels)

| Target | Goal | Measured | Met? |
|---|---|---|---|
| Recall, all labels | ≥ 97% | 80.4% [77.6–82.9] | **NO** |
| Recall, Credentials | ≥ 99% | – | – |
| Recall, Account Number | ≥ 99% | – | – |
| Boundary exact-match | ≥ 95% | 92.3% | **NO** |

### Problems (263)

**missed** (171)

- Business Name · "Quillstone Software" → surfaced as a question · synthetic/0001-hr-email
- Business Name · "Mehta & Sons Traders" → surfaced as a question · synthetic/0006-prose
- Address · "1600 Amphitheatre Parkway, Mountain View" · synthetic/0006-prose
- Business Name · "orbitron labs" · synthetic/0007-lowercase-notes
- Address · "Jl. Merdeka No. 15, Gambir" · synthetic/0010-indonesian
- Business Name · "PT Sinar Jaya Abadi" · synthetic/0010-indonesian
- Address · "Jl. Merdeka No. 10, Gambir\nJakarta - 587035" · synthetic/0012-shipping-label
- Business Name · "Quillstone Software" → surfaced as a question · synthetic/0016-prose
- Business Name · "nimbus foods" · synthetic/0017-lowercase-notes
- Address · "Jl. Sudirman No. 53, Kebayoran" · synthetic/0020-indonesian
- Business Name · "PT Sinar Jaya Abadi" · synthetic/0020-indonesian
- Address · "1600 Amphitheatre Parkway, Mountain View" · synthetic/0025-json
- Business Name · "Kaveri Textiles Ltd" → surfaced as a question · synthetic/0026-prose
- Person Name · "agus wijaya" · synthetic/0027-lowercase-notes
- Business Name · "quillstone software" · synthetic/0027-lowercase-notes
- Address · "Jl. Sudirman No. 6, Menteng" · synthetic/0030-indonesian
- Business Name · "PT Maju Bersama" · synthetic/0030-indonesian
- Address · "Jl. Merdeka No. 10, Gambir, Jakarta" · synthetic/0035-json
- Address · "Jl. Merdeka No. 10, Gambir, Jakarta" · synthetic/0035-json
- Business Name · "Tarang Media Networks" → surfaced as a question · synthetic/0036-prose
- Business Name · "indigo crest hospitality" · synthetic/0037-lowercase-notes
- Address · "Jl. Merdeka No. 10, Gambir, Jakarta" · synthetic/0039-invoice
- Address · "Jl. Sudirman No. 58, Kebayoran" · synthetic/0040-indonesian
- Business Name · "CV Karya Mandiri" · synthetic/0040-indonesian
- Person Name · "Lakshmi Carter" · synthetic/0045-json
- Address · "1600 Amphitheatre Parkway, Mountain View" · synthetic/0045-json
- Business Name · "Zentrix Analytics" · synthetic/0046-prose
- Address · "Jl. Merdeka No. 10, Gambir, Jakarta" · synthetic/0046-prose
- Business Name · "orbitron labs" · synthetic/0047-lowercase-notes
- Business Name · "Quillstone Software" → surfaced as a question · synthetic/0049-invoice
- Address · "1600 Amphitheatre Parkway, Mountain View" · synthetic/0049-invoice
- Address · "Jl. Merdeka No. 56, Menteng" · synthetic/0050-indonesian
- Business Name · "PT Sinar Jaya Abadi" · synthetic/0050-indonesian
- Person Name · "Budi Carter" → surfaced as a question · synthetic/0051-hr-email
- Address · "1600 Amphitheatre Parkway\nMountain View - 310769" · synthetic/0052-shipping-label
- Address · "1600 Amphitheatre Parkway, Mountain View" · synthetic/0055-json
- Business Name · "Greenleaf Pharma" → surfaced as a question · synthetic/0056-prose
- Business Name · "tarang media networks" · synthetic/0057-lowercase-notes
- Business Name · "Indigo Crest Hospitality" · synthetic/0059-invoice
- Address · "Jl. Diponegoro No. 37, Kebayoran" · synthetic/0060-indonesian
- Business Name · "PT Sinar Jaya Abadi" · synthetic/0060-indonesian
- Address · "1600 Amphitheatre Parkway\nMountain View - 701581" · synthetic/0062-shipping-label
- Business Name · "Zentrix Analytics" · synthetic/0063-chat
- Address · "Jl. Merdeka No. 10, Gambir, Jakarta" · synthetic/0065-json
- Business Name · "Vortex Mobility Solutions" → surfaced as a question · synthetic/0066-prose
- Address · "Jl. Merdeka No. 10, Gambir, Jakarta" · synthetic/0066-prose
- Business Name · "quillstone software" · synthetic/0067-lowercase-notes
- Address · "Jl. Sudirman No. 34, Kebayoran" · synthetic/0070-indonesian
- Business Name · "CV Karya Mandiri" · synthetic/0070-indonesian
- Person Name · "Hrithvik" · synthetic/0073-chat
- Person Name · "Hrithvik" · synthetic/0073-chat
- Person Name · "Hrithvik" · synthetic/0073-chat
- Person Name · "Hrithvik" · synthetic/0073-chat
- Person Name · "Sneha Wijaya" · synthetic/0075-json
- Business Name · "Orbitron Labs" → surfaced as a question · synthetic/0076-prose
- Business Name · "kaveri textiles ltd" · synthetic/0077-lowercase-notes
- Business Name · "Indigo Crest Hospitality" · synthetic/0079-invoice
- Address · "Jl. Merdeka No. 83, Menteng" · synthetic/0080-indonesian
- Business Name · "CV Karya Mandiri" · synthetic/0080-indonesian
- Address · "1600 Amphitheatre Parkway\nMountain View - 146138" · synthetic/0082-shipping-label
- … 111 more

**wrong label** (21)

- Person Name · "Kavita Basak" → Business Name · synthetic/0006-prose
- Person Name · "Tanvi Chatterjee" → Business Name · synthetic/0016-prose
- Person Name · "Hrithvik Nair" → Business Name · synthetic/0026-prose
- Person Name · "Budi Silva" → Business Name · synthetic/0036-prose
- Person Name · "Kavya Gill" → Business Name · synthetic/0056-prose
- Person Name · "Budi Oliveira" → Business Name · synthetic/0066-prose
- Person Name · "Maria Gill" → Business Name · synthetic/0076-prose
- Person Name · "Ishaan Sharma" → Business Name · synthetic/0086-prose
- Person Name · "Emily Wijaya" → Business Name · synthetic/0106-prose
- Person Name · "Kavita Wijaya" → Business Name · synthetic/0116-prose
- Person Name · "Deepa Hartono" → Business Name · synthetic/0126-prose
- Person Name · "Arjun Reddy" → Business Name · synthetic/0136-prose
- Person Name · "Sneha Mehta" → Business Name · synthetic/0146-prose
- Person Name · "Maria Hartono" → Business Name · synthetic/0166-prose
- Person Name · "Vikram Gill" → Business Name · synthetic/0176-prose
- Person Name · "Harpreet Silva" → Business Name · synthetic/0186-prose
- Person Name · "Daniel Pillai" → Business Name · synthetic/0196-prose
- Business Name · "Tarang Hospitality" → Address · blind/010-travel
- Business Name · "Orchid Hospitality" → Address · blind/024-travel
- Business Name · "Maple Grove Hospitality" → Address · blind/038-travel
- Business Name · "Sri Venkateswara Hospitality" → Address · blind/052-travel

**false alarm** (8)

- Business Name · "New Delhi. The Field Services" · synthetic/0016-prose
- Business Name · "Pune. The Field Services" · synthetic/0086-prose
- Business Name · "Mountain View. The Field Services" · synthetic/0136-prose
- Business Name · "Mountain View. The Logistics" · synthetic/0166-prose
- Business Name · "London. The Field Services" · synthetic/0186-prose
- Business Name · "Bengaluru. The Logistics" · synthetic/0196-prose
- Contact Number · "7892851498" · blind/021-statement
- Contact Number · "9799891685" · blind/049-statement

**span** (63)

- Address · "Plot 77, Sector 21, Gurugram\"" ≠ "Plot 77, Sector 21, Gurugram" · synthetic/0005-json
- Address · "Plot 77, Sector 21, Gurugram\"" ≠ "Plot 77, Sector 21, Gurugram" · synthetic/0005-json
- Address · "214/09 C-3 Block, Govind Nagar, Kanpur\"" ≠ "214/09 C-3 Block, Govind Nagar, Kanpur" · synthetic/0005-json
- Address · "House No. 9, Gandhi Road, Near City Hospital, Madurai\"" ≠ "House No. 9, Gandhi Road, Near City Hospital, Madurai" · synthetic/0015-json
- Address · "12, 5th Cross, Indiranagar, Bengaluru\"" ≠ "12, 5th Cross, Indiranagar, Bengaluru" · synthetic/0015-json
- Address · "12, 5th Cross, Indiranagar, Bengaluru\"" ≠ "12, 5th Cross, Indiranagar, Bengaluru" · synthetic/0015-json
- Address · "B-14, Lajpat Nagar II" ≠ "B-14, Lajpat Nagar II, New Delhi" · synthetic/0016-prose
- Address · "221 Baker Street, London\"" ≠ "221 Baker Street, London" · synthetic/0025-json
- Address · "Plot 77, Sector 21, Gurugram\"" ≠ "Plot 77, Sector 21, Gurugram" · synthetic/0035-json
- Address · "Plot 77, Sector 21, Gurugram\"" ≠ "Plot 77, Sector 21, Gurugram" · synthetic/0035-json
- Address · "221 Baker Street, London\"" ≠ "221 Baker Street, London" · synthetic/0045-json
- Address · "221 Baker Street, London\"" ≠ "221 Baker Street, London" · synthetic/0045-json
- Address · "House No. 9, Gandhi Road, Near City Hospital, Madurai\"" ≠ "House No. 9, Gandhi Road, Near City Hospital, Madurai" · synthetic/0045-json
- Address · "B-14, Lajpat Nagar II, New Delhi\"" ≠ "B-14, Lajpat Nagar II, New Delhi" · synthetic/0055-json
- Address · "B-14, Lajpat Nagar II, New Delhi\"" ≠ "B-14, Lajpat Nagar II, New Delhi" · synthetic/0055-json
- Address · "221 Baker Street, London\"" ≠ "221 Baker Street, London" · synthetic/0065-json
- Address · "12, 5th Cross, Indiranagar, Bengaluru\"" ≠ "12, 5th Cross, Indiranagar, Bengaluru" · synthetic/0075-json
- Address · "12, 5th Cross, Indiranagar, Bengaluru\"" ≠ "12, 5th Cross, Indiranagar, Bengaluru" · synthetic/0075-json
- Address · "Plot 77, Sector 21, Gurugram\"" ≠ "Plot 77, Sector 21, Gurugram" · synthetic/0075-json
- Address · "221 Baker Street, London\"" ≠ "221 Baker Street, London" · synthetic/0085-json
- Address · "Plot 77, Sector 21, Gurugram\"" ≠ "Plot 77, Sector 21, Gurugram" · synthetic/0085-json
- Address · "Plot 77, Sector 21, Gurugram\"" ≠ "Plot 77, Sector 21, Gurugram" · synthetic/0085-json
- Address · "Flat 302, Sunrise Apartments, MG Road" ≠ "Flat 302, Sunrise Apartments, MG Road, Pune" · synthetic/0086-prose
- Address · "12, 5th Cross, Indiranagar, Bengaluru\"" ≠ "12, 5th Cross, Indiranagar, Bengaluru" · synthetic/0095-json
- Address · "12, 5th Cross, Indiranagar, Bengaluru\"" ≠ "12, 5th Cross, Indiranagar, Bengaluru" · synthetic/0095-json
- Address · "Plot 77, Sector 21, Gurugram\"" ≠ "Plot 77, Sector 21, Gurugram" · synthetic/0095-json
- Address · "221 Baker Street, London\"" ≠ "221 Baker Street, London" · synthetic/0105-json
- Address · "B-14, Lajpat Nagar II, New Delhi\"" ≠ "B-14, Lajpat Nagar II, New Delhi" · synthetic/0105-json
- Address · "221 Baker Street, London\"" ≠ "221 Baker Street, London" · synthetic/0115-json
- Address · "45, 2nd Main, Koramangala 4th Block, Bengaluru\"" ≠ "45, 2nd Main, Koramangala 4th Block, Bengaluru" · synthetic/0115-json
- Address · "214/09 C-3 Block, Govind Nagar, Kanpur\"" ≠ "214/09 C-3 Block, Govind Nagar, Kanpur" · synthetic/0125-json
- Address · "B-14, Lajpat Nagar II, New Delhi\"" ≠ "B-14, Lajpat Nagar II, New Delhi" · synthetic/0125-json
- Address · "45, 2nd Main, Koramangala 4th Block, Bengaluru\"" ≠ "45, 2nd Main, Koramangala 4th Block, Bengaluru" · synthetic/0135-json
- Address · "214/09 C-3 Block, Govind Nagar, Kanpur\"" ≠ "214/09 C-3 Block, Govind Nagar, Kanpur" · synthetic/0135-json
- Address · "45, 2nd Main, Koramangala 4th Block, Bengaluru\"" ≠ "45, 2nd Main, Koramangala 4th Block, Bengaluru" · synthetic/0135-json
- Address · "214/09 C-3 Block, Govind Nagar, Kanpur\"" ≠ "214/09 C-3 Block, Govind Nagar, Kanpur" · synthetic/0145-json
- Address · "Flat 302, Sunrise Apartments, MG Road, Pune\"" ≠ "Flat 302, Sunrise Apartments, MG Road, Pune" · synthetic/0145-json
- Address · "45, 2nd Main, Koramangala 4th Block, Bengaluru\"" ≠ "45, 2nd Main, Koramangala 4th Block, Bengaluru" · synthetic/0155-json
- Address · "House No. 9, Gandhi Road, Near City Hospital, Madurai\"" ≠ "House No. 9, Gandhi Road, Near City Hospital, Madurai" · synthetic/0165-json
- Address · "214/09 C-3 Block, Govind Nagar, Kanpur\"" ≠ "214/09 C-3 Block, Govind Nagar, Kanpur" · synthetic/0165-json
- Address · "House No. 9, Gandhi Road, Near City Hospital, Madurai\"" ≠ "House No. 9, Gandhi Road, Near City Hospital, Madurai" · synthetic/0165-json
- Address · "House No. 9, Gandhi Road, Near City Hospital, Madurai\"" ≠ "House No. 9, Gandhi Road, Near City Hospital, Madurai" · synthetic/0165-json
- Address · "45, 2nd Main, Koramangala 4th Block, Bengaluru\"" ≠ "45, 2nd Main, Koramangala 4th Block, Bengaluru" · synthetic/0175-json
- Address · "45, 2nd Main, Koramangala 4th Block, Bengaluru\"" ≠ "45, 2nd Main, Koramangala 4th Block, Bengaluru" · synthetic/0175-json
- Address · "Flat 302, Sunrise Apartments, MG Road, Pune\"" ≠ "Flat 302, Sunrise Apartments, MG Road, Pune" · synthetic/0185-json
- Address · "214/09 C-3 Block, Govind Nagar, Kanpur\"" ≠ "214/09 C-3 Block, Govind Nagar, Kanpur" · synthetic/0185-json
- Address · "221 Baker Street" ≠ "221 Baker Street, London" · synthetic/0186-prose
- Address · "Flat 302, Sunrise Apartments, MG Road, Pune\"" ≠ "Flat 302, Sunrise Apartments, MG Road, Pune" · synthetic/0195-json
- Address · "House No. 9, Gandhi Road, Near City Hospital, Madurai\"" ≠ "House No. 9, Gandhi Road, Near City Hospital, Madurai" · synthetic/0195-json
- Address · "House No. 9, Gandhi Road, Near City Hospital, Madurai\"" ≠ "House No. 9, Gandhi Road, Near City Hospital, Madurai" · synthetic/0195-json
- Person Name · "Rohan" ≠ "Rohan Carter" · synthetic/0195-json
- Address · "Flat 302, Sunrise Apartments, MG Road, Pune\"" ≠ "Flat 302, Sunrise Apartments, MG Road, Pune" · synthetic/0195-json
- Address · "45, 2nd Main, Koramangala 4th Block" ≠ "45, 2nd Main, Koramangala 4th Block, Bengaluru" · synthetic/0196-prose
- Person Name · "Ravi" ≠ "Ravi Santoso" · blind/005-chat
- Person Name · "Ravi" ≠ "Ravi Santoso" · blind/005-chat
- Person Name · "Ravi" ≠ "Ravi Santoso" · blind/005-chat
- Person Name · "Ravi" ≠ "Ravi Santoso" · blind/005-chat
- Person Username · "@kavyagupta" ≠ "@kavyagupta-dev" · blind/011-git-log
- Business Name · "Sri Venkateswara Logistics Pvt. Ltd" ≠ "Sri Venkateswara Logistics Pvt. Ltd." · blind/014-kyc
- Person Username · "@lakshmikapoor" ≠ "@lakshmikapoor-dev" · blind/025-git-log
- … 3 more

## rules + GLiNER model — no LLM

Per document: 8.4 labels · 0.1 questions · 10.5 cards · 4.1 in Approve-all · time p50 234 ms, p95 1399 ms

### bench-docs

Extension engine alone (label-bench view): recall 100.0%, precision 100.0%.

| Label | Gold | Recall [95% CI] | Precision [95% CI] | Boundary exact | Surfaced | Missed | False alarms |
|---|---|---|---|---|---|---|---|
| Person Name | 16 | 100.0% [80.6–100.0] | 100.0% [80.6–100.0] | 100.0% | 100.0% | 0 | 0 |
| Person Username | 5 | 100.0% [56.6–100.0] | 100.0% [56.6–100.0] | 100.0% | 100.0% | 0 | 0 |
| Email Address | 7 | 100.0% [64.6–100.0] | 100.0% [64.6–100.0] | 100.0% | 100.0% | 0 | 0 |
| Contact Number | 7 | 100.0% [64.6–100.0] | 100.0% [64.6–100.0] | 100.0% | 100.0% | 0 | 0 |
| Address | 3 | 100.0% [43.8–100.0] | 100.0% [43.8–100.0] | 100.0% | 100.0% | 0 | 0 |
| URL/Link | 6 | 100.0% [61.0–100.0] | 100.0% [61.0–100.0] | 100.0% | 100.0% | 0 | 0 |
| Vehicle Number Plate | 4 | 100.0% [51.0–100.0] | 100.0% [51.0–100.0] | 100.0% | 100.0% | 0 | 0 |
| Business Name | 7 | 100.0% [64.6–100.0] | 100.0% [64.6–100.0] | 100.0% | 100.0% | 0 | 0 |
| Account Number | 6 | 100.0% [61.0–100.0] | 100.0% [61.0–100.0] | 100.0% | 100.0% | 0 | 0 |
| Credentials | 8 | 100.0% [67.6–100.0] | 100.0% [67.6–100.0] | 100.0% | 100.0% | 0 | 0 |
| IP Address | 6 | 100.0% [61.0–100.0] | 100.0% [61.0–100.0] | 100.0% | 100.0% | 0 | 0 |
| **All** | 75 | 100.0% [95.1–100.0] | 100.0% [95.1–100.0] | 100.0% | 100.0% | 0 | 0 |

### bench-holdout

Extension engine alone (label-bench view): recall 100.0%, precision 100.0%.

| Label | Gold | Recall [95% CI] | Precision [95% CI] | Boundary exact | Surfaced | Missed | False alarms |
|---|---|---|---|---|---|---|---|
| Person Name | 17 | 100.0% [81.6–100.0] | 100.0% [81.6–100.0] | 100.0% | 100.0% | 0 | 0 |
| Person Username | 2 | 100.0% [34.2–100.0] | 100.0% [34.2–100.0] | 100.0% | 100.0% | 0 | 0 |
| Email Address | 3 | 100.0% [43.8–100.0] | 100.0% [43.8–100.0] | 100.0% | 100.0% | 0 | 0 |
| Contact Number | 3 | 100.0% [43.8–100.0] | 100.0% [43.8–100.0] | 100.0% | 100.0% | 0 | 0 |
| Address | 3 | 100.0% [43.8–100.0] | 100.0% [43.8–100.0] | 100.0% | 100.0% | 0 | 0 |
| URL/Link | 5 | 100.0% [56.6–100.0] | 100.0% [56.6–100.0] | 100.0% | 100.0% | 0 | 0 |
| Vehicle Number Plate | 2 | 100.0% [34.2–100.0] | 100.0% [34.2–100.0] | 100.0% | 100.0% | 0 | 0 |
| Business Name | 2 | 100.0% [34.2–100.0] | 100.0% [34.2–100.0] | 100.0% | 100.0% | 0 | 0 |
| Account Number | 5 | 100.0% [56.6–100.0] | 100.0% [56.6–100.0] | 100.0% | 100.0% | 0 | 0 |
| Credentials | 2 | 100.0% [34.2–100.0] | 100.0% [34.2–100.0] | 100.0% | 100.0% | 0 | 0 |
| IP Address | 3 | 100.0% [43.8–100.0] | 100.0% [43.8–100.0] | 100.0% | 100.0% | 0 | 0 |
| **All** | 47 | 100.0% [92.4–100.0] | 100.0% [92.4–100.0] | 100.0% | 100.0% | 0 | 0 |

### synthetic

Extension engine alone (label-bench view): recall 90.2%, precision 97.0%.

| Label | Gold | Recall [95% CI] | Precision [95% CI] | Boundary exact | Surfaced | Missed | False alarms |
|---|---|---|---|---|---|---|---|
| Person Name | 486 | 93.8% [91.3–95.6] | 100.0% [99.2–100.0] | 99.8% | 97.9% | 30 | 0 |
| Person Username | 20 | 100.0% [83.9–100.0] | 100.0% [83.9–100.0] | 100.0% | 100.0% | 0 | 0 |
| Address | 139 | 83.5% [76.4–88.7] | 100.0% [96.8–100.0] | 50.0% | 87.1% | 23 | 0 |
| Business Name | 206 | 85.4% [80.0–89.6] | 88.0% [82.8–91.8] | 100.0% | 98.5% | 30 | 24 |
| **All** | 851 | 90.2% [88.1–92.1] | 97.0% [95.5–98.0] | 92.3% | 96.4% | 83 | 24 |

### blind

Extension engine alone (label-bench view): recall 98.3%, precision 98.9%.

| Label | Gold | Recall [95% CI] | Precision [95% CI] | Boundary exact | Surfaced | Missed | False alarms |
|---|---|---|---|---|---|---|---|
| Person Name | 262 | 98.9% [96.7–99.6] | 98.9% [96.7–99.6] | 98.5% | 99.2% | 3 | 3 |
| Person Username | 24 | 95.8% [79.8–99.3] | 100.0% [85.7–100.0] | 78.3% | 95.8% | 1 | 0 |
| Email Address | 88 | 100.0% [95.8–100.0] | 100.0% [95.8–100.0] | 100.0% | 100.0% | 0 | 0 |
| Contact Number | 76 | 100.0% [95.2–100.0] | 97.4% [91.1–99.3] | 100.0% | 100.0% | 0 | 2 |
| Address | 20 | 80.0% [58.4–91.9] | 72.7% [51.8–86.8] | 100.0% | 100.0% | 4 | 6 |
| URL/Link | 28 | 85.7% [68.5–94.3] | 100.0% [86.2–100.0] | 100.0% | 85.7% | 4 | 0 |
| Vehicle Number Plate | 12 | 100.0% [75.7–100.0] | 100.0% [75.7–100.0] | 100.0% | 100.0% | 0 | 0 |
| Business Name | 24 | 75.0% [55.1–88.0] | 81.8% [61.5–92.7] | 94.4% | 100.0% | 6 | 4 |
| Account Number | 378 | 100.0% [99.0–100.0] | 100.0% [99.0–100.0] | 100.0% | 100.0% | 0 | 0 |
| Credentials | 396 | 99.0% [97.4–99.6] | 100.0% [99.0–100.0] | 100.0% | 99.0% | 4 | 0 |
| IP Address | 20 | 100.0% [83.9–100.0] | 100.0% [83.9–100.0] | 100.0% | 100.0% | 0 | 0 |
| **All** | 1328 | 98.3% [97.5–98.9] | 98.9% [98.1–99.3] | 99.2% | 99.2% | 22 | 15 |

### Targets (bench-docs + bench-holdout + blind, all 11 labels)

| Target | Goal | Measured | Met? |
|---|---|---|---|
| Recall, all labels | ≥ 97% | 98.5% [97.7–99.0] | yes |
| Recall, Credentials | ≥ 99% | 99.0% [97.5–99.6] | yes |
| Recall, Account Number | ≥ 99% | 100.0% [99.0–100.0] | yes |
| Precision in Approve-all, Account Number | ≥ 98% | 100.0% [99.0–100.0] (n=380) | yes |
| Precision in Approve-all, Contact Number | ≥ 98% | 97.4% [91.0–99.3] (n=77) | **NO** |
| Precision in Approve-all, Credentials | ≥ 98% | 100.0% [99.1–100.0] (n=402) | yes |
| Precision in Approve-all, Email Address | ≥ 98% | 100.0% [96.2–100.0] (n=98) | yes |
| Precision in Approve-all, IP Address | ≥ 98% | 100.0% [88.3–100.0] (n=29) | yes |
| Precision in Approve-all, URL/Link | ≥ 98% | 100.0% [89.3–100.0] (n=32) | yes |
| Precision in Approve-all, Vehicle Number Plate | ≥ 98% | 100.0% [81.6–100.0] (n=17) | yes |
| Boundary exact-match | ≥ 95% | 99.3% | yes |

### Targets (synthetic, 4 model labels)

| Target | Goal | Measured | Met? |
|---|---|---|---|
| Recall, all labels | ≥ 97% | 90.2% [88.1–92.1] | **NO** |
| Recall, Credentials | ≥ 99% | – | – |
| Recall, Account Number | ≥ 99% | – | – |
| Boundary exact-match | ≥ 95% | 92.3% | **NO** |

### Problems (191)

**missed** (83)

- Business Name · "Quillstone Software" → surfaced as a question · synthetic/0001-hr-email
- Business Name · "Mehta & Sons Traders" → surfaced as a question · synthetic/0006-prose
- Address · "1600 Amphitheatre Parkway, Mountain View" · synthetic/0006-prose
- Address · "Jl. Merdeka No. 15, Gambir" → surfaced as a question · synthetic/0010-indonesian
- Address · "Jl. Merdeka No. 10, Gambir\nJakarta - 587035" → surfaced as a question · synthetic/0012-shipping-label
- Business Name · "Quillstone Software" → surfaced as a question · synthetic/0016-prose
- Business Name · "Kaveri Textiles Ltd" → surfaced as a question · synthetic/0026-prose
- Address · "Jl. Merdeka No. 10, Gambir, Jakarta" → surfaced as a question · synthetic/0035-json
- Address · "Jl. Merdeka No. 10, Gambir, Jakarta" · synthetic/0035-json
- Business Name · "Tarang Media Networks" → surfaced as a question · synthetic/0036-prose
- Person Name · "Lakshmi Carter" · synthetic/0045-json
- Address · "1600 Amphitheatre Parkway, Mountain View" · synthetic/0045-json
- Business Name · "Quillstone Software" → surfaced as a question · synthetic/0049-invoice
- Address · "1600 Amphitheatre Parkway, Mountain View" · synthetic/0049-invoice
- Address · "Jl. Merdeka No. 56, Menteng" → surfaced as a question · synthetic/0050-indonesian
- Business Name · "PT Sinar Jaya Abadi" → surfaced as a question · synthetic/0050-indonesian
- Person Name · "Budi Carter" → surfaced as a question · synthetic/0051-hr-email
- Address · "1600 Amphitheatre Parkway\nMountain View - 310769" · synthetic/0052-shipping-label
- Business Name · "Greenleaf Pharma" → surfaced as a question · synthetic/0056-prose
- Address · "1600 Amphitheatre Parkway\nMountain View - 701581" · synthetic/0062-shipping-label
- Business Name · "Vortex Mobility Solutions" → surfaced as a question · synthetic/0066-prose
- Business Name · "quillstone software" · synthetic/0067-lowercase-notes
- Person Name · "Hrithvik" · synthetic/0073-chat
- Person Name · "Hrithvik" · synthetic/0073-chat
- Person Name · "Hrithvik" · synthetic/0073-chat
- Person Name · "Hrithvik" · synthetic/0073-chat
- Business Name · "Orbitron Labs" → surfaced as a question · synthetic/0076-prose
- Business Name · "Indigo Crest Hospitality" · synthetic/0079-invoice
- Address · "1600 Amphitheatre Parkway\nMountain View - 146138" · synthetic/0082-shipping-label
- Business Name · "Lumen Fintech Pvt Ltd" → surfaced as a question · synthetic/0086-prose
- Business Name · "kaveri textiles ltd" → surfaced as a question · synthetic/0087-lowercase-notes
- Person Name · "Budi Hartono" → surfaced as a question · synthetic/0090-indonesian
- Address · "Jl. Merdeka No. 98, Menteng" · synthetic/0090-indonesian
- Business Name · "CV Karya Mandiri" · synthetic/0090-indonesian
- Business Name · "Tarang Media Networks" → surfaced as a question · synthetic/0099-invoice
- Address · "Jl. Merdeka No. 10, Gambir\nJakarta - 385631" · synthetic/0102-shipping-label
- Business Name · "Lumen Fintech Pvt Ltd" → surfaced as a question · synthetic/0106-prose
- Person Name · "Budi" → surfaced as a question · synthetic/0113-chat
- Business Name · "Quillstone Software" → surfaced as a question · synthetic/0113-chat
- Person Name · "Budi" · synthetic/0113-chat
- Business Name · "Lumen Fintech Pvt Ltd" → surfaced as a question · synthetic/0116-prose
- Business Name · "Tarang Media Networks" → surfaced as a question · synthetic/0119-invoice
- Address · "Jl. Sudirman No. 56, Kebayoran" · synthetic/0120-indonesian
- Business Name · "Bluepeak Logistics Pvt Ltd" → surfaced as a question · synthetic/0126-prose
- Address · "Jl. Diponegoro No. 98, Kebayoran" · synthetic/0130-indonesian
- Person Name · "Aisha Santoso" · synthetic/0135-json
- Business Name · "Bluepeak Logistics Pvt Ltd" → surfaced as a question · synthetic/0136-prose
- Address · "1600 Amphitheatre Parkway, Mountain View" · synthetic/0136-prose
- Business Name · "Tarang Media Networks" → surfaced as a question · synthetic/0141-hr-email
- Address · "Jl. Merdeka No. 10, Gambir\nJakarta - 202723" · synthetic/0142-shipping-label
- Business Name · "Mehta & Sons Traders" → surfaced as a question · synthetic/0146-prose
- Address · "Jl. Merdeka No. 10, Gambir, Jakarta" · synthetic/0149-invoice
- Person Name · "Hrithvik" · synthetic/0153-chat
- Business Name · "Tarang Media Networks" → surfaced as a question · synthetic/0153-chat
- Person Name · "Hrithvik" · synthetic/0153-chat
- Address · "1600 Amphitheatre Parkway, Mountain View" · synthetic/0159-invoice
- Business Name · "Kaveri Textiles Ltd" → surfaced as a question · synthetic/0166-prose
- Address · "1600 Amphitheatre Parkway, Mountain View" · synthetic/0166-prose
- Business Name · "Lumen Fintech Pvt Ltd" → surfaced as a question · synthetic/0176-prose
- Address · "Jl. Merdeka No. 10, Gambir, Jakarta" · synthetic/0176-prose
- … 23 more

**wrong label** (22)

- Person Name · "Kavita Basak" → Business Name · synthetic/0006-prose
- Person Name · "Tanvi Chatterjee" → Business Name · synthetic/0016-prose
- Person Name · "Hrithvik Nair" → Business Name · synthetic/0026-prose
- Person Name · "Budi Silva" → Business Name · synthetic/0036-prose
- Address · "Jl. Merdeka No. 10, Gambir, Jakarta" → Business Name · synthetic/0039-invoice
- Person Name · "Kavya Gill" → Business Name · synthetic/0056-prose
- Person Name · "Budi Oliveira" → Business Name · synthetic/0066-prose
- Person Name · "Maria Gill" → Business Name · synthetic/0076-prose
- Person Name · "Ishaan Sharma" → Business Name · synthetic/0086-prose
- Person Name · "Emily Wijaya" → Business Name · synthetic/0106-prose
- Person Name · "Kavita Wijaya" → Business Name · synthetic/0116-prose
- Person Name · "Deepa Hartono" → Business Name · synthetic/0126-prose
- Person Name · "Arjun Reddy" → Business Name · synthetic/0136-prose
- Person Name · "Sneha Mehta" → Business Name · synthetic/0146-prose
- Person Name · "Maria Hartono" → Business Name · synthetic/0166-prose
- Person Name · "Vikram Gill" → Business Name · synthetic/0176-prose
- Person Name · "Harpreet Silva" → Business Name · synthetic/0186-prose
- Person Name · "Daniel Pillai" → Business Name · synthetic/0196-prose
- Business Name · "Tarang Hospitality" → Address · blind/010-travel
- Business Name · "Orchid Hospitality" → Address · blind/024-travel
- Business Name · "Maple Grove Hospitality" → Address · blind/038-travel
- Business Name · "Sri Venkateswara Hospitality" → Address · blind/052-travel

**false alarm** (17)

- Business Name · "New Delhi. The Field Services" · synthetic/0016-prose
- Business Name · "Pune. The Field Services" · synthetic/0086-prose
- Business Name · "Mountain View. The Field Services" · synthetic/0136-prose
- Business Name · "Mountain View. The Logistics" · synthetic/0166-prose
- Business Name · "London. The Field Services" · synthetic/0186-prose
- Business Name · "Bengaluru. The Logistics" · synthetic/0196-prose
- Person Name · "CUST31874" · blind/001-customers-csv
- Address · "PO-93944387" · blind/002-payouts-json
- Address · "PO-96529457" · blind/016-payouts-json
- Business Name · "Andheri West" · blind/021-statement
- Contact Number · "7892851498" · blind/021-statement
- Person Name · "CUST33740" · blind/029-customers-csv
- Business Name · "Talent Acquisition" · blind/034-hr-email
- Business Name · "Gachibowli" · blind/035-statement
- Business Name · "CUST92660" · blind/043-customers-csv
- Person Name · "HR Desk" · blind/048-hr-email
- Contact Number · "9799891685" · blind/049-statement

**span** (69)

- Address · "Plot 77, Sector 21, Gurugram\"" ≠ "Plot 77, Sector 21, Gurugram" · synthetic/0005-json
- Address · "Plot 77, Sector 21, Gurugram\"" ≠ "Plot 77, Sector 21, Gurugram" · synthetic/0005-json
- Address · "214/09 C-3 Block, Govind Nagar, Kanpur\"" ≠ "214/09 C-3 Block, Govind Nagar, Kanpur" · synthetic/0005-json
- Address · "House No. 9, Gandhi Road, Near City Hospital, Madurai\"" ≠ "House No. 9, Gandhi Road, Near City Hospital, Madurai" · synthetic/0015-json
- Address · "12, 5th Cross, Indiranagar, Bengaluru\"" ≠ "12, 5th Cross, Indiranagar, Bengaluru" · synthetic/0015-json
- Address · "12, 5th Cross, Indiranagar, Bengaluru\"" ≠ "12, 5th Cross, Indiranagar, Bengaluru" · synthetic/0015-json
- Address · "B-14, Lajpat Nagar II" ≠ "B-14, Lajpat Nagar II, New Delhi" · synthetic/0016-prose
- Address · "Jl. Sudirman No. 53" ≠ "Jl. Sudirman No. 53, Kebayoran" · synthetic/0020-indonesian
- Address · "221 Baker Street, London\"" ≠ "221 Baker Street, London" · synthetic/0025-json
- Address · "Plot 77, Sector 21, Gurugram\"" ≠ "Plot 77, Sector 21, Gurugram" · synthetic/0035-json
- Address · "Plot 77, Sector 21, Gurugram\"" ≠ "Plot 77, Sector 21, Gurugram" · synthetic/0035-json
- Address · "221 Baker Street, London\"" ≠ "221 Baker Street, London" · synthetic/0045-json
- Address · "221 Baker Street, London\"" ≠ "221 Baker Street, London" · synthetic/0045-json
- Address · "House No. 9, Gandhi Road, Near City Hospital, Madurai\"" ≠ "House No. 9, Gandhi Road, Near City Hospital, Madurai" · synthetic/0045-json
- Address · "B-14, Lajpat Nagar II, New Delhi\"" ≠ "B-14, Lajpat Nagar II, New Delhi" · synthetic/0055-json
- Address · "B-14, Lajpat Nagar II, New Delhi\"" ≠ "B-14, Lajpat Nagar II, New Delhi" · synthetic/0055-json
- Address · "221 Baker Street, London\"" ≠ "221 Baker Street, London" · synthetic/0065-json
- Address · "12, 5th Cross, Indiranagar, Bengaluru\"" ≠ "12, 5th Cross, Indiranagar, Bengaluru" · synthetic/0075-json
- Address · "12, 5th Cross, Indiranagar, Bengaluru\"" ≠ "12, 5th Cross, Indiranagar, Bengaluru" · synthetic/0075-json
- Address · "Plot 77, Sector 21, Gurugram\"" ≠ "Plot 77, Sector 21, Gurugram" · synthetic/0075-json
- Address · "221 Baker Street, London\"" ≠ "221 Baker Street, London" · synthetic/0085-json
- Address · "Plot 77, Sector 21, Gurugram\"" ≠ "Plot 77, Sector 21, Gurugram" · synthetic/0085-json
- Address · "Plot 77, Sector 21, Gurugram\"" ≠ "Plot 77, Sector 21, Gurugram" · synthetic/0085-json
- Address · "Flat 302, Sunrise Apartments, MG Road" ≠ "Flat 302, Sunrise Apartments, MG Road, Pune" · synthetic/0086-prose
- Address · "12, 5th Cross, Indiranagar, Bengaluru\"" ≠ "12, 5th Cross, Indiranagar, Bengaluru" · synthetic/0095-json
- Address · "12, 5th Cross, Indiranagar, Bengaluru\"" ≠ "12, 5th Cross, Indiranagar, Bengaluru" · synthetic/0095-json
- Address · "Plot 77, Sector 21, Gurugram\"" ≠ "Plot 77, Sector 21, Gurugram" · synthetic/0095-json
- Address · "221 Baker Street, London\"" ≠ "221 Baker Street, London" · synthetic/0105-json
- Address · "B-14, Lajpat Nagar II, New Delhi\"" ≠ "B-14, Lajpat Nagar II, New Delhi" · synthetic/0105-json
- Address · "221 Baker Street, London\"" ≠ "221 Baker Street, London" · synthetic/0115-json
- Address · "45, 2nd Main, Koramangala 4th Block, Bengaluru\"" ≠ "45, 2nd Main, Koramangala 4th Block, Bengaluru" · synthetic/0115-json
- Address · "214/09 C-3 Block, Govind Nagar, Kanpur\"" ≠ "214/09 C-3 Block, Govind Nagar, Kanpur" · synthetic/0125-json
- Address · "B-14, Lajpat Nagar II, New Delhi\"" ≠ "B-14, Lajpat Nagar II, New Delhi" · synthetic/0125-json
- Address · "45, 2nd Main, Koramangala 4th Block, Bengaluru\"" ≠ "45, 2nd Main, Koramangala 4th Block, Bengaluru" · synthetic/0135-json
- Address · "214/09 C-3 Block, Govind Nagar, Kanpur\"" ≠ "214/09 C-3 Block, Govind Nagar, Kanpur" · synthetic/0135-json
- Address · "45, 2nd Main, Koramangala 4th Block, Bengaluru\"" ≠ "45, 2nd Main, Koramangala 4th Block, Bengaluru" · synthetic/0135-json
- Address · "Jl. Diponegoro No. 36" ≠ "Jl. Diponegoro No. 36, Kebayoran" · synthetic/0140-indonesian
- Address · "214/09 C-3 Block, Govind Nagar, Kanpur\"" ≠ "214/09 C-3 Block, Govind Nagar, Kanpur" · synthetic/0145-json
- Address · "Flat 302, Sunrise Apartments, MG Road, Pune\"" ≠ "Flat 302, Sunrise Apartments, MG Road, Pune" · synthetic/0145-json
- Address · "Jl. Merdeka No. 17" ≠ "Jl. Merdeka No. 17, Gambir" · synthetic/0150-indonesian
- Address · "45, 2nd Main, Koramangala 4th Block, Bengaluru\"" ≠ "45, 2nd Main, Koramangala 4th Block, Bengaluru" · synthetic/0155-json
- Address · "Jl. Sudirman No. 79" ≠ "Jl. Sudirman No. 79, Kebayoran" · synthetic/0160-indonesian
- Address · "House No. 9, Gandhi Road, Near City Hospital, Madurai\"" ≠ "House No. 9, Gandhi Road, Near City Hospital, Madurai" · synthetic/0165-json
- Address · "214/09 C-3 Block, Govind Nagar, Kanpur\"" ≠ "214/09 C-3 Block, Govind Nagar, Kanpur" · synthetic/0165-json
- Address · "House No. 9, Gandhi Road, Near City Hospital, Madurai\"" ≠ "House No. 9, Gandhi Road, Near City Hospital, Madurai" · synthetic/0165-json
- Address · "House No. 9, Gandhi Road, Near City Hospital, Madurai\"" ≠ "House No. 9, Gandhi Road, Near City Hospital, Madurai" · synthetic/0165-json
- Address · "Jl. Diponegoro No. 73" ≠ "Jl. Diponegoro No. 73, Menteng" · synthetic/0170-indonesian
- Address · "45, 2nd Main, Koramangala 4th Block, Bengaluru\"" ≠ "45, 2nd Main, Koramangala 4th Block, Bengaluru" · synthetic/0175-json
- Address · "45, 2nd Main, Koramangala 4th Block, Bengaluru\"" ≠ "45, 2nd Main, Koramangala 4th Block, Bengaluru" · synthetic/0175-json
- Address · "Flat 302, Sunrise Apartments, MG Road, Pune\"" ≠ "Flat 302, Sunrise Apartments, MG Road, Pune" · synthetic/0185-json
- Address · "214/09 C-3 Block, Govind Nagar, Kanpur\"" ≠ "214/09 C-3 Block, Govind Nagar, Kanpur" · synthetic/0185-json
- Address · "221 Baker Street" ≠ "221 Baker Street, London" · synthetic/0186-prose
- Address · "Jl. Diponegoro No. 19" ≠ "Jl. Diponegoro No. 19, Kebayoran" · synthetic/0190-indonesian
- Address · "Flat 302, Sunrise Apartments, MG Road, Pune\"" ≠ "Flat 302, Sunrise Apartments, MG Road, Pune" · synthetic/0195-json
- Address · "House No. 9, Gandhi Road, Near City Hospital, Madurai\"" ≠ "House No. 9, Gandhi Road, Near City Hospital, Madurai" · synthetic/0195-json
- Address · "House No. 9, Gandhi Road, Near City Hospital, Madurai\"" ≠ "House No. 9, Gandhi Road, Near City Hospital, Madurai" · synthetic/0195-json
- Person Name · "Rohan" ≠ "Rohan Carter" · synthetic/0195-json
- Address · "Flat 302, Sunrise Apartments, MG Road, Pune\"" ≠ "Flat 302, Sunrise Apartments, MG Road, Pune" · synthetic/0195-json
- Address · "45, 2nd Main, Koramangala 4th Block" ≠ "45, 2nd Main, Koramangala 4th Block, Bengaluru" · synthetic/0196-prose
- Person Name · "Ravi" ≠ "Ravi Santoso" · blind/005-chat
- … 9 more


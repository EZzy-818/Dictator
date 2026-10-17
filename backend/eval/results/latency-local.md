# Latency benchmark

2026-10-17T15:43:28.395Z. Target: local backend (127.0.0.1, in-process). Transcription: `gpt-transcribe`. Refinement: `gpt-4.1`. 5 repeats per condition.

Synthetic speech (OpenAI text-to-speech, not a human voice). Mean to Max are the API round trip in ms: request sent → response read, as the caller sees it. Browser stages (audio finalization, frontend display) are not included; the developer panel measures those. Stage columns are means of successful runs, measured by the server; Network ~ is the round trip minus the server total, an estimate. p95 over 5 runs lies between the two slowest runs.

Samples:

- en-5s: 4.8 s, 28 KB WebM/Opus
- en-15s: 16.1 s, 96 KB WebM/Opus
- en-30s: 28.7 s, 174 KB WebM/Opus
- zh-5s: 4.2 s, 27 KB WebM/Opus
- zh-15s: 14.7 s, 87 KB WebM/Opus
- zh-30s: 27.7 s, 165 KB WebM/Opus
- hi-5s: 5.4 s, 32 KB WebM/Opus
- hi-15s: 17.2 s, 97 KB WebM/Opus
- hi-30s: 28.6 s, 166 KB WebM/Opus

## Overall

| Group | Runs | Failed | Mean | p50 | p95 | Min | Max | Upload (server receive) | Transcription | Refinement | Backend overhead | Network ~ |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| All runs | 135 | 0 | 1625 | 1552 | 2504 | 604 | 4051 | 1 | 1012 | 608 | 0 | 3 |

## By refinement level

| Group | Runs | Failed | Mean | p50 | p95 | Min | Max | Upload (server receive) | Transcription | Refinement | Backend overhead | Network ~ |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| none | 45 | 0 | 1015 | 965 | 1522 | 604 | 1677 | 1 | 1009 | 0 | 1 | 4 |
| light | 45 | 0 | 1901 | 1832 | 2634 | 1229 | 3375 | 1 | 1012 | 884 | 0 | 3 |
| medium | 45 | 0 | 1959 | 1844 | 2716 | 1214 | 4051 | 1 | 1015 | 940 | 0 | 3 |

## By recording length

| Group | Runs | Failed | Mean | p50 | p95 | Min | Max | Upload (server receive) | Transcription | Refinement | Backend overhead | Network ~ |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 5s | 45 | 0 | 1219 | 1304 | 1719 | 604 | 1798 | 1 | 693 | 521 | 0 | 4 |
| 15s | 45 | 0 | 1573 | 1708 | 2194 | 741 | 3478 | 1 | 969 | 600 | 0 | 3 |
| 30s | 45 | 0 | 2083 | 2205 | 2882 | 1129 | 4051 | 1 | 1375 | 704 | 1 | 3 |

## By language

| Group | Runs | Failed | Mean | p50 | p95 | Min | Max | Upload (server receive) | Transcription | Refinement | Backend overhead | Network ~ |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| en | 45 | 0 | 1712 | 1708 | 2645 | 622 | 4051 | 1 | 1055 | 651 | 1 | 4 |
| zh | 45 | 0 | 1540 | 1464 | 2361 | 604 | 3478 | 1 | 967 | 568 | 0 | 3 |
| hi | 45 | 0 | 1622 | 1585 | 2408 | 626 | 3375 | 1 | 1013 | 605 | 0 | 3 |

## Every condition

| Group | Runs | Failed | Mean | p50 | p95 | Min | Max | Upload (server receive) | Transcription | Refinement | Backend overhead | Network ~ |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| en 5s none | 5 | 0 | 704 | 653 | 888 | 622 | 943 | 3 | 692 | 0 | 1 | 9 |
| en 5s light | 5 | 0 | 1574 | 1587 | 1756 | 1383 | 1767 | 1 | 704 | 865 | 0 | 4 |
| en 5s medium | 5 | 0 | 1500 | 1535 | 1778 | 1214 | 1798 | 1 | 747 | 749 | 0 | 3 |
| en 15s none | 5 | 0 | 957 | 952 | 994 | 932 | 1003 | 1 | 952 | 0 | 0 | 3 |
| en 15s light | 5 | 0 | 1939 | 1855 | 2194 | 1708 | 2197 | 1 | 1047 | 888 | 0 | 3 |
| en 15s medium | 5 | 0 | 1938 | 1918 | 2093 | 1802 | 2114 | 1 | 982 | 950 | 0 | 4 |
| en 30s none | 5 | 0 | 1419 | 1419 | 1558 | 1264 | 1561 | 1 | 1413 | 0 | 2 | 3 |
| en 30s light | 5 | 0 | 2590 | 2488 | 2865 | 2410 | 2913 | 1 | 1521 | 1063 | 1 | 3 |
| en 30s medium | 5 | 0 | 2785 | 2455 | 3749 | 2427 | 4051 | 1 | 1440 | 1339 | 1 | 4 |
| zh 5s none | 5 | 0 | 645 | 647 | 690 | 604 | 697 | 1 | 640 | 0 | 0 | 4 |
| zh 5s light | 5 | 0 | 1283 | 1268 | 1349 | 1229 | 1363 | 1 | 625 | 655 | 0 | 3 |
| zh 5s medium | 5 | 0 | 1496 | 1462 | 1688 | 1294 | 1714 | 2 | 623 | 869 | 0 | 2 |
| zh 15s none | 5 | 0 | 872 | 799 | 1132 | 741 | 1211 | 1 | 868 | 0 | 0 | 4 |
| zh 15s light | 5 | 0 | 1715 | 1552 | 1980 | 1511 | 1981 | 1 | 921 | 788 | 0 | 5 |
| zh 15s medium | 5 | 0 | 2064 | 1629 | 3238 | 1464 | 3478 | 1 | 1045 | 1015 | 0 | 3 |
| zh 30s none | 5 | 0 | 1323 | 1290 | 1607 | 1129 | 1677 | 1 | 1317 | 0 | 1 | 4 |
| zh 30s light | 5 | 0 | 2221 | 2205 | 2347 | 2112 | 2374 | 1 | 1298 | 918 | 1 | 3 |
| zh 30s medium | 5 | 0 | 2245 | 2131 | 2670 | 2008 | 2760 | 1 | 1371 | 870 | 0 | 3 |
| hi 5s none | 5 | 0 | 832 | 749 | 1075 | 626 | 1084 | 1 | 828 | 0 | 0 | 3 |
| hi 5s light | 5 | 0 | 1471 | 1403 | 1693 | 1304 | 1720 | 1 | 673 | 794 | 0 | 3 |
| hi 5s medium | 5 | 0 | 1463 | 1422 | 1606 | 1378 | 1644 | 1 | 705 | 753 | 0 | 3 |
| hi 15s none | 5 | 0 | 1032 | 1047 | 1118 | 939 | 1127 | 1 | 1028 | 0 | 0 | 3 |
| hi 15s light | 5 | 0 | 1815 | 1832 | 1871 | 1710 | 1874 | 1 | 965 | 846 | 0 | 3 |
| hi 15s medium | 5 | 0 | 1823 | 1784 | 1967 | 1687 | 1989 | 1 | 909 | 910 | 0 | 3 |
| hi 30s none | 5 | 0 | 1349 | 1364 | 1423 | 1263 | 1424 | 1 | 1345 | 0 | 1 | 3 |
| hi 30s light | 5 | 0 | 2497 | 2363 | 3177 | 2143 | 3375 | 1 | 1353 | 1140 | 1 | 3 |
| hi 30s medium | 5 | 0 | 2319 | 2367 | 2458 | 2094 | 2469 | 1 | 1313 | 1002 | 1 | 4 |


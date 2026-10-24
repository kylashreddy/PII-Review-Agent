"""The blind 13-label gold set, generated from a fixed seed at run time.

Why generated: Credentials and Account Number need ~300 values each before "recall >= 99%" means anything, and the
repository must never hold a whole secret-shaped value. Every key, ID and account here is assembled from a seeded
random generator when the set is loaded; check digits are valid (Verhoeff, Luhn, mod-97, GSTIN, CPF), so the rules
cannot reject a value for being fake.

Written without reading the detectors, from the rubric (docs/SINGLE-REVIEW-RUBRIC.md) alone. It is still written by
the same team as the rules, so treat its numbers as optimistic; real answered tasks are the real gate.

Marks: {{Label|value}}. Everything not marked must not be labeled (hard negatives are mixed in on purpose).
"""

from __future__ import annotations

import random
import string
from collections.abc import Callable
from dataclasses import dataclass

SEED = 20261024
N_DOCS_PER_KIND = 4


@dataclass(frozen=True)
class BlindDoc:
    kind: str
    file_name: str
    marked: str


def mk(label: str, value: str) -> str:
    return "{{" + label + "|" + value + "}}"


# ----------------------------------------------------------------------------- check digits

_VD = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
    [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
    [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
    [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
    [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
    [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
    [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
    [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
    [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
]
_VP = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
    [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
    [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
    [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
    [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
    [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
    [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
]
_VINV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9]


def verhoeff_digit(num: str) -> str:
    c = 0
    for i, ch in enumerate(reversed(num)):
        c = _VD[c][_VP[(i + 1) % 8][int(ch)]]
    return str(_VINV[c])


def luhn_digit(num: str) -> str:
    total = 0
    for i, ch in enumerate(reversed(num)):
        d = int(ch)
        if i % 2 == 0:
            d *= 2
            if d > 9:
                d -= 9
        total += d
    return str((10 - total % 10) % 10)


def iban(country: str, bban: str) -> str:
    """ISO 13616: check digits over BBAN + country + "00", letters as 10..35."""
    num = int("".join(str(int(c, 36)) for c in bban + country + "00"))
    return f"{country}{98 - num % 97:02d}{bban}"


_GST = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"


def gstin(r: random.Random, pan: str) -> str:
    body = f"{r.randint(1, 37):02d}{pan}{r.choice('123456789')}Z"
    total = 0
    for i, ch in enumerate(body):
        v = _GST.index(ch) * (2 if i % 2 else 1)
        total += v // 36 + v % 36
    return body + _GST[(36 - total % 36) % 36]


def cpf(r: random.Random) -> str:
    d = [r.randint(0, 9) for _ in range(9)]
    for n in (10, 11):
        total = sum(x * w for x, w in zip(d, range(n, 1, -1), strict=False))
        d.append(0 if total % 11 < 2 else 11 - total % 11)
    s = "".join(map(str, d))
    return f"{s[:3]}.{s[3:6]}.{s[6:9]}-{s[9:]}"


# ----------------------------------------------------------------------------- values


class Values:
    FIRST = (
        "Ravi",
        "Priya",
        "Arjun",
        "Sneha",
        "Kavya",
        "Rahul",
        "Ananya",
        "Vikram",
        "Meera",
        "Suresh",
        "Divya",
        "Karthik",
        "Pooja",
        "Nikhil",
        "Lakshmi",
        "Imran",
        "Fatima",
        "Harpreet",
        "Rohan",
        "Deepa",
        "Anil",
        "Shalini",
        "Venkatesh",
        "Aditi",
        "Gaurav",
        "Neha",
        "Sanjay",
        "Ritu",
        "Manoj",
        "Swathi",
        "Budi",
        "Siti",
        "Maria",
        "John",
        "Chen",
        "Aisha",
        "Joao",
        "Lucas",
    )
    LAST = (
        "Sharma",
        "Reddy",
        "Iyer",
        "Nair",
        "Patel",
        "Gupta",
        "Menon",
        "Rao",
        "Kulkarni",
        "Singh",
        "Das",
        "Banerjee",
        "Chatterjee",
        "Joshi",
        "Pillai",
        "Verma",
        "Mehta",
        "Khan",
        "Gill",
        "Hegde",
        "Shetty",
        "Naidu",
        "Bose",
        "Mishra",
        "Kapoor",
        "Santoso",
        "Wijaya",
        "Silva",
        "Fernandes",
        "Thomas",
    )
    CO_A = (
        "Zentrix",
        "Bluepeak",
        "Sri Venkateswara",
        "Indigo Crest",
        "Nimbus",
        "Tarang",
        "Kaveri",
        "Orchid",
        "Sahyadri",
        "Vardhan",
        "Quillstone",
        "Arunodaya",
        "Greenleaf",
        "Saptagiri",
        "Riverbend",
        "Maple Grove",
    )
    CO_B = (
        "Analytics",
        "Textiles",
        "Agro Industries",
        "Logistics",
        "Software Solutions",
        "Pharma",
        "Traders",
        "Constructions",
        "Foods",
        "Electricals",
        "Media Networks",
        "Hospitality",
    )
    CO_END = ("Pvt Ltd", "Private Limited", "LLP", "Pvt. Ltd.", "Ltd", "")
    STREETS = (
        "MG Road",
        "4th Cross, 2nd Main",
        "Link Road",
        "Station Road",
        "Nehru Street",
        "100 Feet Road",
        "Old Airport Road",
        "Banjara Hills Road No. 12",
        "Linking Road",
        "Park Street",
    )
    LOCALITIES = (
        "Indiranagar",
        "Koramangala",
        "Andheri West",
        "Habsiguda",
        "T Nagar",
        "Salt Lake",
        "Kothrud",
        "Gachibowli",
        "Malviya Nagar",
        "Vashi",
    )
    CITIES = (
        ("Bengaluru", "Karnataka", "5600"),
        ("Mumbai", "Maharashtra", "4000"),
        ("Hyderabad", "Telangana", "5000"),
        ("Chennai", "Tamil Nadu", "6000"),
        ("Kolkata", "West Bengal", "7000"),
        ("Pune", "Maharashtra", "4110"),
        ("Jaipur", "Rajasthan", "3020"),
    )
    UPI = ("okicici", "ybl", "paytm", "okaxis", "oksbi", "upi", "ibl")
    BANKS = ("SBIN", "HDFC", "ICIC", "UTIB", "KKBK", "PUNB", "BARB", "CNRB")
    STATES = ("MH", "KA", "TN", "DL", "TS", "AP", "GJ", "KL", "WB", "UP")

    def __init__(self, r: random.Random) -> None:
        self.r = r

    def d(self, n: int) -> str:
        return "".join(self.r.choice(string.digits) for _ in range(n))

    def up(self, n: int) -> str:
        return "".join(self.r.choice(string.ascii_uppercase) for _ in range(n))

    def an(self, n: int, alphabet: str = string.ascii_letters + string.digits) -> str:
        return "".join(self.r.choice(alphabet) for _ in range(n))

    def first(self) -> str:
        return self.r.choice(self.FIRST)

    def last(self) -> str:
        return self.r.choice(self.LAST)

    def name(self) -> str:
        return f"{self.first()} {self.last()}"

    def company(self) -> str:
        end = self.r.choice(self.CO_END)
        return f"{self.r.choice(self.CO_A)} {self.r.choice(self.CO_B)}" + (f" {end}" if end else "")

    def handle(self, first: str, last: str) -> str:
        f, la = first.lower(), last.lower()
        return self.r.choice(
            (f"{f}_{la[0]}{self.d(2)}", f"{f}.{la}{self.d(2)}", f"{f}{la}-dev", f"{f[0]}{la}_{self.d(3)}")
        )

    def email(self, first: str, last: str, domain: str | None = None) -> str:
        dom = domain or self.r.choice(("gmail.com", "yahoo.co.in", "outlook.com", "rediffmail.com", "hotmail.com"))
        return f"{first.lower()}.{last.lower()}{self.d(2)}@{dom}"

    def phone(self) -> str:
        m = self.r.choice("6789") + self.d(9)
        return self.r.choice(
            (
                f"+91 {m[:5]} {m[5:]}",
                f"+91-{m}",
                m,
                f"0{m[:5]} {m[5:]}",
                f"+91 {m}",
                f"080 {self.d(4)} {self.d(4)}",
                f"022-{self.d(8)}",
                f"1800 {self.d(3)} {self.d(4)}",
                f"+44 20 {self.d(4)} {self.d(4)}",
                f"+1 (415) {self.r.randint(200, 989)}-{self.d(4)}",
            )
        )

    def street_address(self) -> tuple[str, str, str]:
        city, _, pin = self.r.choice(self.CITIES)
        house = self.r.choice(
            (
                f"No. {self.r.randint(1, 250)}",
                f"Flat {self.r.randint(101, 1204)}",
                f"H.No. {self.r.randint(1, 9)}-{self.r.randint(1, 12)}-{self.r.randint(10, 300)}",
                f"Plot {self.r.randint(1, 90)}",
            )
        )
        bld = self.r.choice(("Sai Residency", "Lake View Apartments", "Prestige Shantiniketan", "Green Park Towers"))
        street = self.r.choice(self.STREETS)
        loc = self.r.choice(self.LOCALITIES)
        return f"{house}, {bld}, {street}, {loc}, {city}", city, pin + self.d(2)

    def plate(self) -> str:
        st = self.r.choice(self.STATES)
        n = f"{self.r.randint(1, 50):02d}"
        return self.r.choice(
            (
                f"{st}{n}{self.up(2)}{self.d(4)}",
                f"{st} {n} {self.up(2)} {self.d(4)}",
                f"{st}-{n}-{self.up(2)}-{self.d(4)}",
                f"{self.r.randint(21, 25)}BH{self.d(4)}{self.up(2)}",
            )
        )

    def ipv4_public(self) -> str:
        return f"{self.r.choice((49, 103, 117, 122, 152, 182, 203))}.{self.r.randint(1, 254)}.{self.r.randint(0, 254)}.{self.r.randint(1, 254)}"

    def ipv4_private(self) -> str:
        return self.r.choice(
            (
                f"10.{self.r.randint(0, 255)}.{self.r.randint(0, 255)}.{self.r.randint(1, 254)}",
                f"192.168.{self.r.randint(0, 20)}.{self.r.randint(2, 254)}",
                f"172.{self.r.randint(16, 31)}.{self.r.randint(0, 255)}.{self.r.randint(1, 254)}",
            )
        )

    def ipv6(self) -> str:
        return f"2401:4900:{self.an(4, '0123456789abcdef')}:{self.an(4, '0123456789abcdef')}::{self.an(2, '123456789abcdef')}"

    def mac(self) -> str:
        return ":".join(self.an(2, "0123456789abcdef") for _ in range(6))

    # ---- account numbers
    def bank_account(self) -> str:
        return self.r.choice("123456789") + self.d(self.r.choice((10, 11, 13, 15)))

    def ifsc(self) -> str:
        return f"{self.r.choice(self.BANKS)}0{self.r.choice((self.d(6), self.up(2) + self.d(4)))}"

    def card(self) -> str:
        prefix = self.r.choice(("4", "51", "52", "53", "55"))
        body = prefix + self.d(15 - len(prefix))
        num = body + luhn_digit(body)
        groups = [num[i : i + 4] for i in range(0, 16, 4)]
        return self.r.choice((num, " ".join(groups), "-".join(groups)))

    def upi(self, first: str) -> str:
        return f"{first.lower()}{self.d(self.r.choice((0, 2, 4)))}@{self.r.choice(self.UPI)}"

    def iban(self) -> str:
        country = self.r.choice(("GB", "DE", "FR", "AE"))
        bban = {"GB": self.up(4) + self.d(14), "DE": self.d(18), "FR": self.d(23), "AE": self.d(19)}[country]
        return iban(country, bban)

    def eth(self) -> str:
        return "0x" + self.an(40, "0123456789abcdef")

    # ---- credentials
    def aadhaar(self) -> str:
        n = self.r.choice("23456789") + self.d(10)
        n += verhoeff_digit(n)
        return self.r.choice((f"{n[:4]} {n[4:8]} {n[8:]}", n, f"{n[:4]}-{n[4:8]}-{n[8:]}"))

    def pan(self, kind: str = "P") -> str:
        return f"{self.up(3)}{kind}{self.up(1)}{self.d(4)}{self.up(1)}"

    def gstin(self) -> str:
        return gstin(self.r, self.pan("C"))

    def passport_in(self) -> str:
        return self.r.choice("JKLMNPRSTUVWZ") + self.r.choice("123456789") + self.d(6)

    def voter_id(self) -> str:
        return self.up(3) + self.d(7)

    def dl(self) -> str:
        return f"{self.r.choice(self.STATES)}{self.r.randint(1, 50):02d} {self.r.randint(2005, 2023)}{self.d(7)}"

    def ssn(self) -> str:
        return f"{self.r.randint(100, 665)}-{self.r.randint(10, 99)}-{self.r.randint(1000, 9999)}"

    def cpf(self) -> str:
        return cpf(self.r)

    def nik(self) -> str:
        return f"{self.r.choice(('31', '32', '33', '35', '51'))}{self.d(4)}{self.r.randint(1, 28):02d}{self.r.randint(1, 12):02d}{self.r.randint(70, 99)}{self.d(4)}"

    def aws(self) -> str:
        return "AK" + "IA" + self.an(16, string.ascii_uppercase + "234567")

    def stripe(self) -> str:
        return "sk_" + "live_" + self.an(24) + self.an(self.r.randint(0, 75))

    def github(self) -> str:
        return "gh" + "p_" + self.an(36)

    def slack(self) -> str:
        return "xo" + f"xb-{self.d(11)}-{self.d(13)}-" + self.an(24)

    def google(self) -> str:
        return "AI" + "za" + self.an(35, string.ascii_letters + string.digits + "-_")

    def openai(self) -> str:
        return "sk-" + "proj-" + self.an(48, string.ascii_letters + string.digits + "_-")

    def jwt(self) -> str:
        b = string.ascii_letters + string.digits + "-_"
        return "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." + "eyJ" + self.an(40, b) + "." + self.an(43, b)

    def sendgrid(self) -> str:
        b = string.ascii_letters + string.digits + "-_"
        return "S" + "G." + self.an(22, b) + "." + self.an(43, b)

    def password(self) -> str:
        return self.r.choice(
            (
                f"{self.r.choice(self.FIRST)}@{self.d(4)}",
                f"Sup3r${self.an(6)}!",
                f"{self.an(10)}#{self.d(2)}",
                f"Welcome@{self.d(3)}",
                f"{self.an(4)}!{self.an(5)}9",
            )
        )

    def conn_url(self) -> str:
        host = self.r.choice(("db.internal.zentrix.io", self.ipv4_private(), "prod-mysql.bluepeak.in"))
        scheme, port = self.r.choice((("postgres", 5432), ("mysql", 3306), ("mongodb", 27017), ("redis", 6379)))
        return f"{scheme}://{self.r.choice(('app_user', 'admin', 'svc_orders'))}:{self.an(10)}@{host}:{port}/{self.r.choice(('orders', 'payments', 'crm'))}"


# ----------------------------------------------------------------------------- documents

Gen = Callable[[Values, int], tuple[str, str]]  # -> (file name, marked text)
N = "Person Name"
U = "Person Username"
E = "Email Address"
P = "Contact Number"
A = "Address"
L = "URL/Link"
V = "Vehicle Number Plate"
B = "Business Name"
AC = "Account Number"
C = "Credentials"
IP = "IP Address"


def kyc_form(v: Values, i: int) -> tuple[str, str]:
    f, la = v.first(), v.last()
    addr, city, pin = v.street_address()
    pan, aad = v.pan(), v.aadhaar()
    bank = v.r.choice(("State Bank of India", "HDFC Bank", "ICICI Bank", "Axis Bank"))
    lines = [
        "CUSTOMER KYC FORM",
        f"Applicant Name: {mk(N, f'{f} {la}')}",
        f"Father's Name: {mk(N, v.name())}",
        f"Date of Birth: {v.r.randint(1, 28):02d}/{v.r.randint(1, 12):02d}/{v.r.randint(1960, 2002)}",
        f"Mobile: {mk(P, v.phone())}",
        f"Email: {mk(E, v.email(f, la))}",
        f"Residential Address: {mk(A, addr)} - {pin}",
        f"PAN: {mk(C, pan)}",
        f"Aadhaar No.: {mk(C, aad)}",
        f"Bank: {bank}, A/c No. {mk(AC, v.bank_account())}, IFSC {mk(AC, v.ifsc())}",
        f"UPI ID: {mk(AC, v.upi(f))}",
        f"Vehicle Registration: {mk(V, v.plate())}",
        f"Employer: {mk(B, v.company())}",
        f"Status: Verified   Branch: {city}   Application No: KYC/{v.d(4)}/{v.d(3)}",
        "Declaration: I confirm the above details are correct. [SIGNATURE]",
    ]
    return f"kyc_form_{i:03d}.txt", "\n".join(lines) + "\n"


def customer_csv(v: Values, i: int) -> tuple[str, str]:
    rows = ["customer_id,full_name,phone,email,pan,aadhaar,account_no,ifsc,card_number,city,signup_date"]
    for k in range(12):
        f, la = v.first(), v.last()
        rows.append(
            ",".join(
                (
                    f"CUST{v.d(5)}",
                    mk(N, f"{f} {la}"),
                    mk(P, v.phone().replace(",", "")),
                    mk(E, v.email(f, la)),
                    mk(C, v.pan()),
                    mk(C, v.aadhaar().replace(" ", "")),
                    mk(AC, v.bank_account()),
                    mk(AC, v.ifsc()),
                    mk(AC, v.card().replace(" ", "")),
                    v.r.choice(Values.CITIES)[0],
                    f"2024-{v.r.randint(1, 12):02d}-{k + 10}",
                )
            )
        )
    return f"by-pii-type~~mixed~~customers_{i:03d}.csv", "\n".join(rows) + "\n"


def payouts_json(v: Values, i: int) -> tuple[str, str]:
    items = []
    for _ in range(8):
        f, la = v.first(), v.last()
        items.append(
            "  {\n"
            f'    "payout_id": "PO-{v.d(8)}",\n'
            f'    "beneficiary": "{mk(N, f"{f} {la}")}",\n'
            f'    "upi": "{mk(AC, v.upi(f))}",\n'
            f'    "iban": "{mk(AC, v.iban())}",\n'
            f'    "account_number": "{mk(AC, v.bank_account())}",\n'
            f'    "gstin": "{mk(C, v.gstin())}",\n'
            f'    "amount": {v.r.randint(500, 90000)}.00,\n'
            f'    "status": "{v.r.choice(("SUCCESS", "PENDING", "FAILED"))}"\n'
            "  }"
        )
    return f"payouts_{i:03d}.json", "[\n" + ",\n".join(items) + "\n]\n"


def env_config(v: Values, i: int) -> tuple[str, str]:
    lines = [
        "# service configuration",
        f"APP_NAME=orders-service-{i}",
        "APP_ENV=production",
        "PORT=8080",
        f"DB_HOST={mk(IP, v.ipv4_private())}",
        f"DB_PASSWORD={mk(C, v.password())}",
        "DB_PASSWORD_REF=${DB_PASSWORD}",
        f"DATABASE_URL={mk(C, v.conn_url())}",
        f"STRIPE_SECRET_KEY={mk(C, v.stripe())}",
        f"AWS_ACCESS_KEY_ID={mk(C, v.aws())}",
        f"GITHUB_TOKEN={mk(C, v.github())}",
        f"SLACK_BOT_TOKEN={mk(C, v.slack())}",
        f"GOOGLE_MAPS_KEY={mk(C, v.google())}",
        f"OPENAI_API_KEY={mk(C, v.openai())}",
        f"SENDGRID_API_KEY={mk(C, v.sendgrid())}",
        "API_KEY_FROM_ENV=process.env.API_KEY",
        f"SUPPORT_EMAIL={mk(E, 'support@' + v.r.choice(('zentrix.io', 'bluepeak.in', 'kaverifoods.com')))}",
        f"BUILD_SHA={v.an(40, '0123456789abcdef')}",
        f"REQUEST_ID={v.an(8, '0123456789abcdef')}-{v.an(4, '0123456789abcdef')}-4{v.an(3, '0123456789abcdef')}-a{v.an(3, '0123456789abcdef')}-{v.an(12, '0123456789abcdef')}",
        "TIMEOUT_MS=3000",
        "DEV_URL=http://localhost:3000/api",
    ]
    return f"config_{i:03d}.env", "\n".join(lines) + "\n"


def server_log(v: Values, i: int) -> tuple[str, str]:
    lines = []
    for k in range(6):
        f, la = v.first(), v.last()
        ts = f"2024-03-{k + 10:02d} 10:{v.r.randint(10, 59)}:{v.r.randint(10, 59)}"
        lines.append(
            v.r.choice(
                (
                    f"{ts} INFO  login ok user={mk(U, v.handle(f, la))} ip={mk(IP, v.ipv4_public())}",
                    f"{ts} WARN  failed login from {mk(IP, v.ipv6())} attempts=3",
                    f"{ts} DEBUG device mac={mk(IP, v.mac())} build=4.{k}.1 version 10.0.19045",
                    f"{ts} INFO  GET /api/v1/orders/{v.d(5)} 200 12ms client={mk(IP, v.ipv4_private())}",
                    f"{ts} ERROR auth failed token={mk(C, v.jwt())}",
                )
            )
        )
    lines.append(
        f"2024-03-20 11:00:00 INFO  webhook from {mk(L, 'https://hooks.' + v.r.choice(('zentrix.io', 'bluepeak.in')) + '/razorpay/' + v.d(5))}"
    )
    lines.append("2024-03-20 11:00:01 INFO  health check http://127.0.0.1:8080/health ok")
    return f"server_{i:03d}.log", "\n".join(lines) + "\n"


def chat(v: Values, i: int) -> tuple[str, str]:
    a_f, a_l = v.first(), v.last()
    agent = v.first()
    addr, _, pin = v.street_address()
    lines = [
        f"[12/03/24, 9:1{i % 10} AM] Agent {mk(N, agent)}: Hi, how can I help you today?",
        f"[12/03/24, 9:1{i % 10} AM] {mk(N, f'{a_f} {a_l}')}: my order hasn't arrived, order no ORD-{v.d(6)}",
        f"[12/03/24, 9:2{i % 10} AM] Agent {mk(N, agent)}: Sorry about that. Can you confirm your registered mobile?",
        f"[12/03/24, 9:2{i % 10} AM] {mk(N, f'{a_f} {a_l}')}: sure, it is {mk(P, v.phone())}",
        f"[12/03/24, 9:2{i % 10} AM] Agent {mk(N, agent)}: And the delivery address?",
        f"[12/03/24, 9:3{i % 10} AM] {mk(N, f'{a_f} {a_l}')}: {mk(A, addr)}, PIN {pin}",
        f"[12/03/24, 9:3{i % 10} AM] Agent {mk(N, agent)}: Thanks {mk(N, a_f)}. Refund of Rs. {v.r.randint(200, 5000)} will go to your UPI {mk(AC, v.upi(a_f))}.",
        f"[12/03/24, 9:3{i % 10} AM] {mk(N, f'{a_f} {a_l}')}: ok. my username on the app is {mk(U, v.handle(a_f, a_l))}",
        f"[12/03/24, 9:4{i % 10} AM] Agent {mk(N, agent)}: Done. Please do not share your OTP or password with anyone. - Customer Support",
    ]
    return f"chat_{i:03d}.txt", "\n".join(lines) + "\n"


def hr_email(v: Values, i: int) -> tuple[str, str]:
    f, la = v.first(), v.last()
    hr_f, hr_l = v.first(), v.last()
    co = v.company()
    dom = co.split()[0].lower() + ".com"
    lines = [
        f"From: {mk(N, f'{hr_f} {hr_l}')} <{mk(E, f'{hr_f.lower()}.{hr_l.lower()}@{dom}')}>",
        f"To: {mk(E, v.email(f, la))}",
        "Subject: Offer letter and onboarding",
        "",
        f"Dear {mk(N, f)},",
        "",
        f"Welcome to {mk(B, co)}! Your joining date is 01 April 2024 at our office, {mk(A, v.street_address()[0])}.",
        f"Please upload your PAN ({mk(C, v.pan())}) and passport number ({mk(C, v.passport_in())}) on {mk(L, 'https://hr.' + dom + '/onboarding/' + v.d(6))}.",
        f"Your salary account will be opened with HDFC Bank; share your existing account {mk(AC, v.bank_account())} for the first month's payout.",
        "For any questions write to the HR Desk or call our toll-free line.",
        f"Our LinkedIn page: {mk(L, 'https://www.linkedin.com/company/' + co.split()[0].lower() + '-' + v.d(3))}",
        "",
        "Regards,",
        f"{mk(N, f'{hr_f} {hr_l}')}",
        "Senior Analyst, Talent Acquisition",
        f"{mk(P, v.phone())}",
    ]
    return f"offer_{i:03d}.eml", "\n".join(lines) + "\n"


def bank_statement(v: Values, i: int) -> tuple[str, str]:
    f, la = v.first(), v.last()
    lines = [
        f"STATEMENT OF ACCOUNT - {mk(N, f'{f} {la}'.upper())}",
        f"Account No: {mk(AC, v.bank_account())}   IFSC: {mk(AC, v.ifsc())}   Branch: {v.r.choice(Values.LOCALITIES)}",
        f"Card linked: {mk(AC, v.card())}",
        "Date        Narration                                      Debit      Credit",
    ]
    for k in range(6):
        p_f, p_l = v.first(), v.last()
        lines.append(
            v.r.choice(
                (
                    f"0{k + 1}/04/24  NEFT-{mk(N, f'{p_f} {p_l}'.upper())}-SALARY                         {v.r.randint(20000, 90000)}.00",
                    f"0{k + 1}/04/24  UPI/{mk(AC, v.upi(p_f))}/groceries          {v.r.randint(100, 3000)}.00",
                    f"0{k + 1}/04/24  IMPS/{mk(N, f'{p_f} {p_l}'.upper())}/{mk(AC, v.bank_account())}     {v.r.randint(1000, 20000)}.00",
                    f"0{k + 1}/04/24  POS {v.r.choice(('AMAZON', 'SWIGGY', 'RELIANCE FRESH'))} REF {v.d(10)}        {v.r.randint(100, 3000)}.00",
                )
            )
        )
    lines.append(f"Closing balance: Rs. {v.r.randint(1000, 500000)},{v.d(3)}.00")
    return f"statement_{i:03d}.txt", "\n".join(lines) + "\n"


def id_records(v: Values, i: int) -> tuple[str, str]:
    rows = ["| record_id | name | voter_id | driving_licence | passport | ssn | cpf |", "|---|---|---|---|---|---|---|"]
    for _ in range(8):
        rows.append(
            f"| R{v.d(6)} | {mk(N, v.name())} | {mk(C, v.voter_id())} | {mk(C, v.dl())} | {mk(C, v.passport_in())} | "
            f"{mk(C, v.ssn())} | {mk(C, v.cpf())} |"
        )
    return f"id_records_{i:03d}.md", "\n".join(rows) + "\n"


def invoice(v: Values, i: int) -> tuple[str, str]:
    seller, buyer = v.company(), v.company()
    addr, city, pin = v.street_address()
    lines = [
        "TAX INVOICE",
        f"Seller: {mk(B, seller)}",
        f"GSTIN: {mk(C, v.gstin())}",
        "Ship to:",
        f"{mk(A, addr + chr(10) + city + ' - ' + pin)}",
        f"Buyer: {mk(B, buyer)}   Contact: {mk(N, v.name())}, {mk(P, v.phone())}",
        f"Invoice No: INV/{v.d(4)}/{i:03d}   Date: 12-04-2024   PO: PO-{v.d(6)}",
        "Item: Goods and Services as per order   Qty 4   Amount Rs. 12,400",
        f"Pay to: A/c {mk(AC, v.bank_account())}, IFSC {mk(AC, v.ifsc())} or UPI {mk(AC, v.upi(v.first()))}",
        f"Track your order at {mk(L, 'https://' + seller.split()[0].lower() + 'store.in/track?id=' + v.d(8))}",
        "Terms and Conditions apply. This is a computer generated invoice. Visit https://www.google.com for maps.",
    ]
    return f"invoice_{i:03d}.txt", "\n".join(lines) + "\n"


def travel(v: Values, i: int) -> tuple[str, str]:
    f, la = v.first(), v.last()
    lines = [
        "BOOKING CONFIRMATION",
        f"Passenger: Mr. {mk(N, f'{f} {la}')}",
        f"Passport: {mk(C, v.passport_in())}   Nationality: Indian",
        f"Mobile {mk(P, v.phone())} · Email {mk(E, v.email(f, la))}",
        # docs/GUIDE.md: payment cards are Account Number "with CVV and expiry".
        f"Paid with card {mk(AC, v.card())} (exp {mk(AC, f'{v.r.randint(1, 12):02d}/{v.r.randint(26, 31)}')})",
        f"Pickup vehicle {mk(V, v.plate())}, driver {mk(N, v.name())} ({mk(P, v.phone())})",
        f"Hotel: {mk(B, v.r.choice(Values.CO_A) + ' Hospitality')}, {mk(A, v.street_address()[0])}",
        f"Manage booking: {mk(L, 'https://trips.' + v.r.choice(('yatrika.in', 'safarnama.co')) + '/b/' + v.an(10))}",
        "Placeholder for co-passenger: [NAME] / XXXX-XXXX",
    ]
    return f"booking_{i:03d}.txt", "\n".join(lines) + "\n"


def git_log(v: Values, i: int) -> tuple[str, str]:
    lines = []
    for _ in range(4):
        f, la = v.first(), v.last()
        lines += [
            f"commit {v.an(40, '0123456789abcdef')}",
            f"Author: {mk(N, f'{f} {la}')} <{mk(E, f'{f.lower()}.{la.lower()}@' + v.r.choice(('zentrix.io', 'gmail.com')))}>",
            "Date:   Tue Mar 12 10:15:22 2024 +0530",
            "",
            f"    fix payment retry (reviewed by {mk(U, '@' + v.handle(v.first(), v.last()))})",
            "",
        ]
    lines.append(f"remote: {mk(L, 'git@github.com:' + v.r.choice(('zentrix', 'bluepeak')) + '/payments.git')}")
    lines.append("dependency: @babel/core 7.24.0, see https://registry.npmjs.org/@babel/core")
    return f"repo~~.git~~logs~~HEAD_{i:03d}", "\n".join(lines) + "\n"


def wallets(v: Values, i: int) -> tuple[str, str]:
    rows = ["name\twallet_address\tnik\tiban"]
    for _ in range(8):
        rows.append(f"{mk(N, v.name())}\t{mk(AC, v.eth())}\t{mk(C, v.nik())}\t{mk(AC, v.iban())}")
    return f"by-pii-type~~crypto_wallet~~wallets_{i:03d}.tsv", "\n".join(rows) + "\n"


def prose(v: Values, i: int) -> tuple[str, str]:
    f, la = v.first(), v.last()
    co = v.company()
    text = (
        f"On Monday {mk(N, f'{f} {la}')} visited the {mk(B, co)} office near Infosys to discuss the contract. "
        f"{mk(N, f)} said the Field Services team would share the draft by Friday. "
        f"The vendor's account {mk(AC, v.bank_account())} (IFSC {mk(AC, v.ifsc())}) was verified by Customer Support, "
        f"and {mk(N, f)} asked that payments also be sent to {mk(AC, v.upi(f))}. "
        f"The Aadhaar number {mk(C, v.aadhaar())} and PAN {mk(C, v.pan())} were attached to the ticket. "
        f"The car, {mk(V, v.plate())}, was parked outside {v.r.choice(Values.CITIES)[0]} station. "
        f"Portfolio: {mk(L, f.lower() + la.lower() + '.dev')}. Reach out at {mk(E, v.email(f, la))} or {mk(P, v.phone())}. "
        "See https://example.com/docs for the template and email test@example.com for samples.\n"
    )
    return f"notes_{i:03d}.txt", text


KINDS: dict[str, Gen] = {
    "kyc": kyc_form,
    "customers-csv": customer_csv,
    "payouts-json": payouts_json,
    "env": env_config,
    "server-log": server_log,
    "chat": chat,
    "hr-email": hr_email,
    "statement": bank_statement,
    "id-records": id_records,
    "invoice": invoice,
    "travel": travel,
    "git-log": git_log,
    "wallets": wallets,
    "prose": prose,
}


def generate(seed: int = SEED, per_kind: int = N_DOCS_PER_KIND) -> list[BlindDoc]:
    r = random.Random(seed)
    v = Values(r)
    docs = []
    for k in range(per_kind):
        for kind, gen in KINDS.items():
            file_name, marked = gen(v, k)
            docs.append(BlindDoc(kind, file_name, marked))
    return docs

import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { getSettings } from "@/modules/business";
import { cardKey, customerFromCardKey, customerTier } from "@/modules/customers";
import { getBalance } from "@/modules/ledger";
import { TIER_LABEL, tierAtLeast, unitForMode } from "@/modules/rules";
import { LEDGER_LABEL } from "@/ui/labels";
import { fmtServerDate } from "@/ui/format";
import CardClient from "./card-client";

export const metadata = { title: "بطاقتي — شاهي قمرا" };

export default async function CardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ k?: string }>;
}) {
  const { id } = await params;
  const { k } = await searchParams;
  const customer = await customerFromCardKey(id, k ?? "").catch(() => null);
  if (!customer) notFound();

  const settings = await getSettings(customer.businessId);
  const unit = unitForMode(settings.programMode);
  const word = unit === "STAMP" ? "ختم" : "نقطة";
  const [balance, tier, rewards, entries, expiring] = await Promise.all([
    getBalance(customer.id, unit),
    customerTier(customer.id, settings),
    prisma.reward.findMany({
      where: { businessId: customer.businessId, active: true, unit },
      orderBy: [{ sortOrder: "asc" }, { cost: "asc" }],
    }),
    prisma.ledgerEntry.findMany({ where: { customerId: customer.id }, orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.ledgerEntry.findFirst({
      where: { customerId: customer.id, unit: "POINT", points: { gt: 0 }, expiresAt: { gt: new Date() } },
      orderBy: { expiresAt: "asc" },
      select: { expiresAt: true },
    }),
  ]);
  const goal = unit === "STAMP" ? settings.stampsPerReward : settings.rewardThreshold;
  const key = cardKey(customer);
  const devWallet = env.apple.devMode || env.google.devMode;

  return (
    <main className="wrap stack">
      <div className="brandbar">
        <img src="/icon-192.png" alt="" />
        <h1>شاهي قمرا</h1>
      </div>

      <div className="card">
        <div className="top">
          <span className="name">{customer.name}</span>
          <span className="tier">{TIER_LABEL[tier]}</span>
        </div>
        <span className="moon" />
        <div>
          <div className="balance">
            {balance}
            <small>{word}</small>
          </div>
          <progress max={goal} value={Math.min(balance, goal)} aria-label="التقدم نحو المكافأة" />
          <div className="small">
            {balance >= goal ? "لديك مكافأة متاحة 🎉" : `باقي ${goal - balance} ${word} للمكافأة القادمة`}
          </div>
        </div>
      </div>

      <section className="panel stack">
        <h2>أضف البطاقة إلى جوالك</h2>
        <a className="btn wallet-btn" href={`/api/card/${customer.id}/apple?k=${key}`}>
            أضف إلى Apple Wallet
        </a>
        <a className="btn wallet-btn" href={`/api/card/${customer.id}/google?k=${key}`}>
          أضف إلى Google Wallet
        </a>
        {devWallet && <p className="muted small">وضع التطوير: بعض الشهادات غير مضبوطة بعد، فالزر يعرض معاينة فقط.</p>}
        <p className="muted small">احفظ رابط هذه الصفحة؛ فهو مفتاح بطاقتك ولا تشاركه مع أحد.</p>
      </section>

      <CardClient
        id={customer.id}
        cardKey={key}
        promoOptOut={customer.promoOptOut}
        hasBirthday={customer.birthMonth != null}
        referralUrl={`${env.appUrl}/?ref=${customer.referralCode}`}
        referralCode={customer.referralCode}
      />

      <section className="panel">
        <h2>المكافآت</h2>
        {rewards.length === 0 && <p className="muted">لا توجد مكافآت حالياً.</p>}
        <ul className="stack" role="list">
          {rewards.map((r) => {
            const ok = balance >= r.cost && tierAtLeast(tier, r.minTier);
            return (
              <li key={r.id} className="row spread">
                <span>
                  <b>{r.name}</b>
                  {r.minTier !== "BRONZE" && <span className="tag"> {TIER_LABEL[r.minTier]} فأعلى</span>}
                  <br />
                  <span className="muted small">{r.description}</span>
                </span>
                <span className={ok ? "pos" : "muted"}>
                  {r.cost} {word}
                </span>
              </li>
            );
          })}
        </ul>
        {expiring?.expiresAt && (
          <p className="muted small">أقرب نقاط تنتهي صلاحيتها في {fmtServerDate(expiring.expiresAt)}.</p>
        )}
      </section>

      <section className="panel">
        <h2>سجل الحركات</h2>
        {entries.length === 0 && <p className="muted">لا توجد حركات بعد. امسح البطاقة عند الكاشير مع طلبك القادم.</p>}
        <div className="table-wrap">
          <table>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td>
                    {LEDGER_LABEL[e.type]}
                    <br />
                    <span className="muted small">{fmtServerDate(e.createdAt)}</span>
                  </td>
                  <td>
                    <span className={e.points > 0 ? "pos" : "neg"}>
                      {e.points > 0 ? "+" : ""}
                      {e.points}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

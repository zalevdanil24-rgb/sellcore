import { notFound } from "next/navigation";

// Заглушки разделов, которые появятся на этапе 3.
const sections: Record<string, { title: string; text: string }> = {
  ads: { title: "РнП реклама", text: "Перенесём сюда РнП с Apps Script: карточки артикулов, тепловая карта, 14 дней." },
  supplies: { title: "Поставки FBO", text: "Сколько и когда отгрузить по каждому артикулу — по выкупам, с запасом на 30 дней." },
  tasks: { title: "Задачи", text: "Задачи и ежедневная отчётность команды." },
  products: { title: "Товары", text: "Карточки, себестоимость по партиям." },
  finance: { title: "Финансы", text: "Экономика кабинетов и сводка по юрлицам." },
};

export default async function Section({ params }: { params: Promise<{ section: string }> }) {
  const s = sections[(await params).section];
  if (!s) notFound();
  return (
    <>
      <div className="topbar"><h1>{s.title}</h1><span className="status status-wait">Скоро</span></div>
      <div className="card"><p className="muted" style={{ margin: 0 }}>{s.text}</p></div>
    </>
  );
}

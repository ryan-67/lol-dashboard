import { useState } from 'react'

const FAQ_ITEMS = [
  {
    question: 'what is nucky?',
    answer:
      'nucky is a statistics-backed LoL esports analytics product: a free dashboard, proprietary rating and prediction systems, and an optional conversational analyst grounded in the same data.',
  },
  {
    question: 'what data does nucky know?',
    answer:
      'The analytics pipeline ingests tier-1 professional match data, while the retrieval-augmented knowledge base reaches across twelve years of historical match records and indexed esports context. Current dashboard coverage focuses on LCK, LPL, LEC, LCS, MSI, Worlds, First Stand, and EWC.',
  },
  {
    question: 'how is nucky different from a normal AI chatbot?',
    answer:
      'General chatbots primarily answer from broad training memory. nucky retrieves LoL esports-specific evidence, queries structured match statistics, and receives model-generated rating and prediction packets. It can ground an answer in the relevant numbers and say when the evidence is not there.',
  },
  {
    question: 'how is nucky different from a raw stat site?',
    answer:
      'Raw-stat sites are useful sources of box scores. nucky adds interpretation: team and player ratings, form, strength of schedule, champion matchup evidence, style profiles, trend detection, and a conversational layer that can connect those signals.',
  },
  {
    question: 'does nucky watch every series live?',
    answer:
      'No. nucky ingests match data and indexed context, then builds ratings, trends, analyses, and predictions from those artifacts. It does not claim to watch broadcasts or consume every live frame.',
  },
  {
    question: 'why is the conversational analyst subscription gated?',
    answer:
      'The beta is $3.99 per month because retrieval, model inference, and tool calls have real operating costs. The statistics dashboard remains free to browse, and full launch pricing is planned at $5 per month.',
  },
]

/** FAQ — indexed accordion; items cascade in, answers unfold on a spring-free ease. */
export default function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0)

  const handleToggle = (index: number) => {
    setOpenIndex(openIndex === index ? null : index)
  }

  return (
    <section
      className="faq landing-inner"
      id="faq"
      data-accent-hue="195"
      aria-label="Frequently asked questions"
    >
      <div className="section-head">
        <p className="section-label" data-reveal="blur-in">faq</p>
        <h2 className="section-title" data-motion-text>
          questions, answered
        </h2>
      </div>

      <div className="faq-list" data-reveal-group>
        {FAQ_ITEMS.map((item, index) => {
          const open = openIndex === index
          return (
            <article
              className={`faq-item${open ? ' is-open' : ''}`}
              key={item.question}
              data-reveal-item
            >
              <h3 className="faq-question">
                <button type="button" aria-expanded={open} onClick={() => handleToggle(index)}>
                  <span className="faq-index" aria-hidden="true">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="faq-question-text">{item.question}</span>
                  <span className="faq-toggle" aria-hidden="true" />
                </button>
              </h3>
              <div className="faq-answer" aria-hidden={!open}>
                <div className="faq-answer-inner">
                  <p>{item.answer}</p>
                </div>
              </div>
            </article>
          )
        })}
      </div>

      <p className="faq-contact" data-reveal="fade-up">
        Built by geonbu, a LoL esports fan and solo developer. Questions?{' '}
        <a href="mailto:geonbu@nucky.gg">geonbu@nucky.gg</a>
      </p>
    </section>
  )
}

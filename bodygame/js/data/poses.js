/**
 * Prompt-based question library for Pose Mirror.
 * `question.title` is the main prompt shown to the user.
 */

const POSES = [
  // ── EASY ──────────────────────────────────────────────────────────────────
  {
    id: 'question_one',
    difficulty: 'easy',
    question: { title: '1', subtitle: 'Stand straight' },
    angles: {
      elbow_L: 170, elbow_R: 170,
      shoulder_L: 10, shoulder_R: 10,
      knee_L: 175, knee_R: 175,
      hip_L: 175, hip_R: 175,
      spine: 90,
    },
  },
  {
    id: 'question_y',
    difficulty: 'easy',
    question: { title: 'Tree', subtitle: 'Arms wide in a Y, feet together' },
    angles: {
      elbow_L: 175, elbow_R: 175,
      shoulder_L: 145, shoulder_R: 145,
      knee_L: 175, knee_R: 175,
      hip_L: 175, hip_R: 175,
      spine: 90,
    },
  },
  {
    id: 'question_big',
    difficulty: 'easy',
    question: { title: 'Star', subtitle: 'Spread arms and legs wide' },
    angles: {
      elbow_L: 175, elbow_R: 175,
      shoulder_L: 90, shoulder_R: 90,
      knee_L: 175, knee_R: 175,
      hip_L: 145, hip_R: 145,
      spine: 90,
    },
  },

  // ── MEDIUM ────────────────────────────────────────────────────────────────
  {
    id: 'question_a',
    difficulty: 'medium',
    question: { title: 'Rocket', subtitle: 'Legs apart, palms together overhead' },
    angles: {
      elbow_L: 175, elbow_R: 175,
      shoulder_L: 170, shoulder_R: 170,
      knee_L: 172, knee_R: 172,
      hip_L: 160, hip_R: 160,
      spine: 90,
    },
  },
  {
    id: 'question_t',
    difficulty: 'medium',
    question: { title: 'Hanger', subtitle: 'Arms straight out to the sides' },
    angles: {
      elbow_L: 175, elbow_R: 175,
      shoulder_L: 90, shoulder_R: 90,
      knee_L: 175, knee_R: 175,
      hip_L: 175, hip_R: 175,
      spine: 90,
    },
  },

  // ── HARD ──────────────────────────────────────────────────────────────────
  {
    id: 'question_l',
    difficulty: 'hard',
    question: { title: 'L', subtitle: 'Left arm up, right arm out, legs together' },
    angles: {
      elbow_L: 175, shoulder_L: 170,
      elbow_R: 175, shoulder_R: 90,
      knee_L: 175, knee_R: 175,
      hip_L: 175, hip_R: 175,
      spine: 90,
    },
  },
]

window.POSES = POSES

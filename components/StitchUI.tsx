'use client';

import { motion } from 'framer-motion';
import { Scene } from './Scene';

export function StitchUI() {
  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden px-4 py-20">
      <div className="container mx-auto max-w-5xl relative z-10 text-center">
        <motion.div
          initial="hidden"
          animate="visible"
          variants={{
            hidden: { opacity: 0 },
            visible: {
              opacity: 1,
              transition: {
                staggerChildren: 0.2,
              },
            },
          }}
        >
          <motion.h1
            variants={{
              hidden: { opacity: 0, y: 20 },
              visible: { opacity: 1, y: 0 },
            }}
            transition={{ duration: 0.8 }}
            className="text-5xl md:text-7xl tracking-tight mb-6 leading-tight text-white font-serif-custom"
          >
            Stitch UI
          </motion.h1>
          <motion.p
            variants={{
              hidden: { opacity: 0, y: 20 },
              visible: { opacity: 1, y: 0 },
            }}
            transition={{ duration: 0.8 }}
            className="text-xl text-white/80 mb-10 max-w-2xl mx-auto"
          >
            This is a new screen implemented with Stitch UI. A 3D model will be displayed below.
          </motion.p>
        </motion.div>
        <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="w-full h-96 bg-gray-800/20 rounded-lg mt-10"
        >
            <Scene />
        </motion.div>
      </div>
    </section>
  );
}

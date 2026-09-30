export const INTRO_KEY = "gabo:intro-seen";

/** Runs before first paint (in <head>) so a reload in the same session never flashes the intro. */
export const introSeenScript = `try{if(sessionStorage.getItem("${INTRO_KEY}"))document.documentElement.dataset.intro="seen"}catch(e){}`;
